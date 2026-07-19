import { Memory, TEXT_BASE } from './memory';

export type CPUStatus = 'RUNNING' | 'HALTED' | 'WAITING_INPUT' | 'WAITING_FLOAT_INPUT';

export class CPU {
  // Register Int Utama ($0 - $31)
  public registers: Int32Array;
  
  // Register Floating Point / Coprocessor 1 ($f0 - $f31)
  public fRegisters: Float32Array; 
  private fpuIntView: Int32Array; // View khusus untuk cast bit murni Float <-> Int

  public pc: number;
  public hi: number;
  public lo: number;
  private memory: Memory;

  // File Descriptor Management untuk Syscall 13-16
  private fdCounter = 3; // 0=stdin, 1=stdout, 2=stderr
  private openFiles = new Map<number, string>();

  // Callbacks ke UI (React)
  public onPrint: (text: string) => void = () => {};
  public onExit: (code: number) => void = () => {};
  public onInputRequired: (type: 'int' | 'float') => void = () => {}; 

  constructor(memory: Memory) {
    this.registers = new Int32Array(32);
    this.fRegisters = new Float32Array(32);
    this.fpuIntView = new Int32Array(this.fRegisters.buffer);
    
    this.pc = TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    this.memory = memory;
  }

  public reset(): void {
    this.registers.fill(0);
    this.fRegisters.fill(0);
    this.pc = TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    
    // Stack Pointer MIPS konvensional (Dimulai 4 byte di bawah batas tertinggi Stack)
    this.registers[29] = 0x80000000 - 4; 
    
    this.openFiles.clear();
    this.fdCounter = 3;
  }

  // Fungsi untuk menerima Input dari Terminal UI
  public provideInput(value: number, type: 'int' | 'float' = 'int'): void {
    if (type === 'int') {
      this.registers[2] = value | 0; // Masuk ke $v0 (Integer)
    } else {
      this.fRegisters[0] = value;    // Masuk ke $f0 (Float)
    }
  }

  public step(): CPUStatus {
    const instruction = this.memory.read32(this.pc);
    
    // Asumsi: Memori kosong (0x00000000) adalah instruksi sll $0, $0, 0 (NOP)
    // Jika kita mencapai titik eksekusi ini di luar batas program yang valid, hentikan.
    if (instruction === 0 && this.pc !== TEXT_BASE && this.memory.read32(this.pc - 4) === 0) {
      this.onExit(0);
      return 'HALTED';
    }

    const opcode = (instruction >>> 26) & 0x3F;
    const rs = (instruction >>> 21) & 0x1F;
    const rt = (instruction >>> 16) & 0x1F;
    const rd = (instruction >>> 11) & 0x1F;
    const shamt = (instruction >>> 6) & 0x1F;
    const funct = instruction & 0x3F;

    const imm = instruction & 0xFFFF;
    const immSigned = (imm & 0x8000) ? (imm | 0xFFFF0000) : imm;

    let nextPc = this.pc + 4; 

    if (opcode === 0x00) {
      // =========================================================================
      // R-TYPE INSTRUCTIONS (ALU)
      // =========================================================================
      switch (funct) {
        case 0x20: this.registers[rd] = this.registers[rs] + this.registers[rt]; break; // add
        case 0x21: this.registers[rd] = (this.registers[rs] + this.registers[rt]) | 0; break; // addu
        case 0x22: this.registers[rd] = this.registers[rs] - this.registers[rt]; break; // sub
        case 0x23: this.registers[rd] = (this.registers[rs] - this.registers[rt]) | 0; break; // subu
        case 0x24: this.registers[rd] = this.registers[rs] & this.registers[rt]; break; // and
        case 0x25: this.registers[rd] = this.registers[rs] | this.registers[rt]; break; // or
        
        case 0x18: // mult
          const product = BigInt(this.registers[rs]) * BigInt(this.registers[rt]);
          this.lo = Number(product & BigInt(0xFFFFFFFF)) | 0;
          this.hi = Number((product >> BigInt(32)) & BigInt(0xFFFFFFFF)) | 0;
          break;
        case 0x1A: // div
          if (this.registers[rt] !== 0) {
            this.lo = Math.trunc(this.registers[rs] / this.registers[rt]);
            this.hi = this.registers[rs] % this.registers[rt];
          }
          break;
        case 0x12: this.registers[rd] = this.lo; break; // mflo
        case 0x10: this.registers[rd] = this.hi; break; // mfhi
        
        case 0x00: this.registers[rd] = this.registers[rt] << shamt; break; // sll
        case 0x02: this.registers[rd] = (this.registers[rt] >>> shamt) | 0; break; // srl
        
        case 0x2A: this.registers[rd] = (this.registers[rs] < this.registers[rt]) ? 1 : 0; break; // slt
        
        case 0x08: nextPc = this.registers[rs]; break; // jr
        
        case 0x0C: // syscall
          const sysResult = this.handleSyscall();
          if (sysResult !== 'RUNNING') {
            this.pc = nextPc; 
            return sysResult;
          }
          break;
        default: throw new Error(`[CPU Exception] Unimplemented R-Type Funct: 0x${funct.toString(16)}`);
      }
    } else if (opcode === 0x1C) {
      // =========================================================================
      // SPECIAL MIPS32 INSTRUCTIONS (mul)
      // =========================================================================
      if (funct === 0x02) {
        this.registers[rd] = Math.imul(this.registers[rs], this.registers[rt]); // mul
      } else {
        throw new Error(`[CPU Exception] Unimplemented Opcode 0x1C Funct: 0x${funct.toString(16)}`);
      }
    } else if (opcode === 0x11) {
      // =========================================================================
      // COPROCESSOR 1 (Floating Point Unit)
      // =========================================================================
      const fmt = rs;
      if (fmt === 0x00) { // mfc1 $rt, $fs
         this.registers[rt] = this.fpuIntView[rd];
      } else if (fmt === 0x04) { // mtc1 $rt, $fs
         this.fpuIntView[rd] = this.registers[rt];
      } else if (fmt === 0x10) { // Single Precision FPU Operations
         const fdFPU = shamt; 
         if (funct === 0x00) this.fRegisters[fdFPU] = this.fRegisters[rd] + this.fRegisters[rt]; // add.s
         else if (funct === 0x01) this.fRegisters[fdFPU] = this.fRegisters[rd] - this.fRegisters[rt]; // sub.s
         else if (funct === 0x02) this.fRegisters[fdFPU] = this.fRegisters[rd] * this.fRegisters[rt]; // mul.s
         else if (funct === 0x03) this.fRegisters[fdFPU] = this.fRegisters[rd] / this.fRegisters[rt]; // div.s
         else throw new Error(`[CPU Exception] Unimplemented FPU Funct: 0x${funct.toString(16)}`);
      } else {
        throw new Error(`[CPU Exception] Unimplemented COP1 Format: 0x${fmt.toString(16)}`);
      }
    } else {
      // =========================================================================
      // I-TYPE & J-TYPE INSTRUCTIONS (Memory, Immediate, Control Flow)
      // =========================================================================
      switch (opcode) {
        case 0x08: this.registers[rt] = this.registers[rs] + immSigned; break; // addi
        case 0x09: this.registers[rt] = (this.registers[rs] + immSigned) | 0; break; // addiu
        case 0x0C: this.registers[rt] = this.registers[rs] & imm; break; // andi
        case 0x0D: this.registers[rt] = (this.registers[rs] | imm) | 0; break; // ori
        case 0x0E: this.registers[rt] = this.registers[rs] ^ imm; break; // xori
        case 0x0F: this.registers[rt] = (imm << 16) | 0; break; // lui
        
        case 0x0A: this.registers[rt] = (this.registers[rs] < immSigned) ? 1 : 0; break; // slti
        
        // Memory Integer
        case 0x2B: this.memory.write32(this.registers[rs] + immSigned, this.registers[rt]); break; // sw
        case 0x28: this.memory.write8(this.registers[rs] + immSigned, this.registers[rt] & 0xFF); break; // sb
        case 0x23: this.registers[rt] = this.memory.read32(this.registers[rs] + immSigned); break; // lw
        case 0x20: // lb
          let byte = this.memory.read8(this.registers[rs] + immSigned);
          if (byte & 0x80) byte |= 0xFFFFFF00; // Sign-extend
          this.registers[rt] = byte;
          break;

        // Memory FPU
        case 0x31: // lwc1 $ft, offset($rs)
          this.fpuIntView[rt] = this.memory.read32(this.registers[rs] + immSigned);
          break;
        case 0x39: // swc1 $ft, offset($rs)
          this.memory.write32(this.registers[rs] + immSigned, this.fpuIntView[rt]);
          break;
          
        // Branching
        case 0x04: // beq
          if (this.registers[rs] === this.registers[rt]) nextPc = nextPc + (immSigned << 2);
          break;
        case 0x05: // bne
          if (this.registers[rs] !== this.registers[rt]) nextPc = nextPc + (immSigned << 2);
          break;
          
        // Jumping
        case 0x02: // j
          nextPc = (nextPc & 0xF0000000) | ((instruction & 0x03FFFFFF) << 2); 
          break;
        case 0x03: // jal
          this.registers[31] = nextPc; // $ra
          nextPc = (nextPc & 0xF0000000) | ((instruction & 0x03FFFFFF) << 2); 
          break;
          
        default: throw new Error(`[CPU Exception] Unimplemented Opcode: 0x${opcode.toString(16)}`);
      }
    }

    this.registers[0] = 0; // Hardwired MIPS Rule: $zero selalu nol
    this.pc = nextPc;
    return 'RUNNING';
  }

  // =========================================================================
  // SYSCALL HANDLER (Termasuk Ekstensi File I/O & FPU)
  // =========================================================================
  private handleSyscall(): CPUStatus {
    const v0 = this.registers[2]; 
    switch (v0) {
      case 1: this.onPrint(this.registers[4].toString()); break; // print_int
      case 2: this.onPrint(this.fRegisters[12].toString()); break; // print_float ($f12)
      case 4: this.onPrint(this.memory.readString(this.registers[4])); break; // print_string
      
      case 5: this.onInputRequired('int'); return 'WAITING_INPUT'; // read_int
      case 6: this.onInputRequired('float'); return 'WAITING_FLOAT_INPUT'; // read_float
      
      case 10: this.onExit(0); return 'HALTED'; // exit
      case 17: this.onExit(this.registers[4]); return 'HALTED'; // exit2 (custom code in $a0)
      
      // -- FILE I/O (Di-bypass menggunakan Browser LocalStorage) --
      case 13: { // open file ($a0 = filename address, $a1 = flags, $a2 = mode)
        const filename = this.memory.readString(this.registers[4]);
        const fd = this.fdCounter++;
        this.openFiles.set(fd, filename);
        // Buat file (key) baru di LocalStorage jika belum ada
        if (localStorage.getItem(`mips_fs_${filename}`) === null) {
          localStorage.setItem(`mips_fs_${filename}`, "");
        }
        this.registers[2] = fd; // Return File Descriptor ke $v0
        break;
      }
      case 14: { // read file ($a0 = fd, $a1 = buffer, $a2 = length)
        const fd = this.registers[4];
        const bufferAddr = this.registers[5];
        const length = this.registers[6];
        const filename = this.openFiles.get(fd);
        
        if (filename) {
          const content = localStorage.getItem(`mips_fs_${filename}`) || "";
          const readLength = Math.min(length, content.length);
          for (let i = 0; i < readLength; i++) {
             this.memory.write8(bufferAddr + i, content.charCodeAt(i));
          }
          this.registers[2] = readLength; // Return chars read
        } else { 
          this.registers[2] = -1; // File tidak ditemukan / belum dibuka
        }
        break;
      }
      case 15: { // write file ($a0 = fd, $a1 = buffer, $a2 = length)
        const fd = this.registers[4];
        const bufferAddr = this.registers[5];
        const length = this.registers[6];
        const filename = this.openFiles.get(fd);
        
        if (filename) {
          let strToAppend = "";
          for (let i = 0; i < length; i++) {
            strToAppend += String.fromCharCode(this.memory.read8(bufferAddr + i));
          }
          const prevContent = localStorage.getItem(`mips_fs_${filename}`) || "";
          localStorage.setItem(`mips_fs_${filename}`, prevContent + strToAppend);
          this.registers[2] = length; // Return chars written
        } else { 
          this.registers[2] = -1; 
        }
        break;
      }
      case 16: // close file ($a0 = fd)
        this.openFiles.delete(this.registers[4]);
        this.registers[2] = 0;
        break;

      default: throw new Error(`[CPU Exception] Unimplemented syscall service: ${v0}`);
    }
    return 'RUNNING';
  }
}