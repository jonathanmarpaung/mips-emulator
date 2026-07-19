import { Memory, TEXT_BASE } from './memory';

export type CPUStatus = 'RUNNING' | 'HALTED' | 'WAITING_INPUT';

export class CPU {
  public registers: Int32Array;
  public pc: number;
  public hi: number;
  public lo: number;
  private memory: Memory;

  public onPrint: (text: string) => void = () => {};
  public onExit: (code: number) => void = () => {};
  public onInputRequired: () => void = () => {}; 

  constructor(memory: Memory) {
    this.registers = new Int32Array(32);
    this.pc = TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    this.memory = memory;
  }

  public reset(): void {
    this.registers.fill(0);
    this.pc = TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    this.registers[29] = 0x80000000 - 4; // $sp (Stack Pointer) dimulai dari bawah batas
  }

  public provideInput(value: number): void {
    this.registers[2] = value; 
  }

  public step(): CPUStatus {
    const instruction = this.memory.read32(this.pc);
    
    if (instruction === 0) {
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
      // FORMAT R-TYPE
      switch (funct) {
        case 0x20: this.registers[rd] = this.registers[rs] + this.registers[rt]; break; // add
        case 0x21: this.registers[rd] = (this.registers[rs] + this.registers[rt]) | 0; break; // addu
        case 0x22: this.registers[rd] = this.registers[rs] - this.registers[rt]; break; // sub
        case 0x23: this.registers[rd] = (this.registers[rs] - this.registers[rt]) | 0; break; // subu
        case 0x24: this.registers[rd] = this.registers[rs] & this.registers[rt]; break; // and
        case 0x25: this.registers[rd] = this.registers[rs] | this.registers[rt]; break; // or
        
        case 0x18: // mult
          const product = BigInt(this.registers[rs]) * BigInt(this.registers[rt]);
          this.lo = Number(product & 0xFFFFFFFFn) | 0;
          this.hi = Number((product >> 32n) & 0xFFFFFFFFn) | 0;
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
        default: throw new Error(`Unimplemented R-Type Funct: 0x${funct.toString(16)}`);
      }
    } else if (opcode === 0x1C) {
      // FORMAT SPESIAL MIPS32 (mul)
      if (funct === 0x02) {
        this.registers[rd] = Math.imul(this.registers[rs], this.registers[rt]); // mul
      } else {
        throw new Error(`Unimplemented Opcode 0x1C Funct: 0x${funct.toString(16)}`);
      }
    } else {
      // FORMAT I-TYPE & J-TYPE
      switch (opcode) {
        case 0x08: this.registers[rt] = this.registers[rs] + immSigned; break; // addi
        case 0x09: this.registers[rt] = (this.registers[rs] + immSigned) | 0; break; // addiu
        case 0x0C: this.registers[rt] = this.registers[rs] & imm; break; // andi
        case 0x0D: this.registers[rt] = (this.registers[rs] | imm) | 0; break; // ori
        case 0x0E: this.registers[rt] = this.registers[rs] ^ imm; break; // xori
        case 0x0F: this.registers[rt] = (imm << 16) | 0; break; // lui
        
        case 0x0A: this.registers[rt] = (this.registers[rs] < immSigned) ? 1 : 0; break; // slti
        
        case 0x2B: this.memory.write32(this.registers[rs] + immSigned, this.registers[rt]); break; // sw
        case 0x28: this.memory.write8(this.registers[rs] + immSigned, this.registers[rt] & 0xFF); break; // sb
        case 0x23: this.registers[rt] = this.memory.read32(this.registers[rs] + immSigned); break; // lw
        case 0x20: // lb
          let byte = this.memory.read8(this.registers[rs] + immSigned);
          if (byte & 0x80) byte |= 0xFFFFFF00; // Sign-extend
          this.registers[rt] = byte;
          break;
          
        case 0x04: // beq
          if (this.registers[rs] === this.registers[rt]) nextPc = nextPc + (immSigned << 2);
          break;
        case 0x05: // bne
          if (this.registers[rs] !== this.registers[rt]) nextPc = nextPc + (immSigned << 2);
          break;
          
        case 0x02: // j
          nextPc = (nextPc & 0xF0000000) | ((instruction & 0x03FFFFFF) << 2); 
          break;
        case 0x03: // jal
          this.registers[31] = nextPc; 
          nextPc = (nextPc & 0xF0000000) | ((instruction & 0x03FFFFFF) << 2); 
          break;
          
        default: throw new Error(`Unimplemented Opcode: 0x${opcode.toString(16)}`);
      }
    }

    this.registers[0] = 0; 
    this.pc = nextPc;
    return 'RUNNING';
  }

  private handleSyscall(): CPUStatus {
    const v0 = this.registers[2]; 
    switch (v0) {
      case 1: this.onPrint(this.registers[4].toString()); break;
      case 4: this.onPrint(this.memory.readString(this.registers[4])); break;
      case 5: this.onInputRequired(); return 'WAITING_INPUT'; 
      case 10: this.onExit(0); return 'HALTED';
      case 17: this.onExit(this.registers[4]); return 'HALTED';
      default: throw new Error(`Unimplemented syscall service: ${v0}`);
    }
    return 'RUNNING';
  }
}