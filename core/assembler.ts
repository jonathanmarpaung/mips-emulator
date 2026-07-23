import { DATA_BASE, TEXT_BASE } from './memory';

export class Assembler {
  
  /**
   * ========================================================================
   * 1. PREPROCESSOR (Mendukung .include & Virtual File System)
   * Menggabungkan file secara rekursif dan memblokir Infinite Loop (Circular).
   * ========================================================================
   */
  private preprocess(code: string, visitedFiles: Set<string>): string {
    const lines = code.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Deteksi pola: .include "namafile.s" atau .include "folder/math.s"
      const includeMatch = line.match(/^\s*\.include\s+"([^"]+)"/);

      if (includeMatch) {
        let filename = includeMatch[1];
        
        // Normalisasi path (jika user iseng menulis ./math.s)
        if (filename.startsWith('./')) filename = filename.substring(2);

        // PROTEKSI MUTLAK: Mencegah Infinite Loop (A include B, B include A)
        if (visitedFiles.has(filename)) {
          throw new Error(`[Preprocessor Error] Terdeteksi Circular Include (Looping) pada file: "${filename}"`);
        }

        // Mengambil isi teks file dari Virtual File System (LocalStorage)
        const fileKey = `mips_fs_${filename}`;
        const fileContent = typeof window !== 'undefined' ? localStorage.getItem(fileKey) : null;

        if (fileContent === null) {
          throw new Error(`[Preprocessor Error] File tidak ditemukan: "${filename}". Pastikan file berada di Explorer.`);
        }

        // Tandai file ini sudah dikunjungi di cabang rekursif ini
        const newVisited = new Set(visitedFiles);
        newVisited.add(filename);

        // Rekursif: Jika file yang di-include ternyata meng-include file lain
        const processedInclude = this.preprocess(fileContent, newVisited);
        
        // Suntikkan isi file dengan penanda komentar untuk debugging
        processedLines.push(`# --- BEGIN INCLUDE: ${filename} ---`);
        processedLines.push(processedInclude);
        processedLines.push(`# --- END INCLUDE: ${filename} ---`);
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * ========================================================================
   * STRICT SECURITY GATE 1: Register Validation
   * Mendukung integer register ($t0) dan FPU register ($f0)
   * ========================================================================
   */
  private parseRegister(regStr: string): number {
    if (!regStr) throw new Error(`[Syntax Error] Argumen register hilang!`);
    const clean = regStr.trim().replace(',', '').toLowerCase();
    
    const regMap: Record<string, number> = {
      '$zero': 0, '$at': 1,
      '$v0': 2, '$v1': 3,
      '$a0': 4, '$a1': 5, '$a2': 6, '$a3': 7,
      '$t0': 8, '$t1': 9, '$t2': 10, '$t3': 11, '$t4': 12, '$t5': 13, '$t6': 14, '$t7': 15,
      '$s0': 16, '$s1': 17, '$s2': 18, '$s3': 19, '$s4': 20, '$s5': 21, '$s6': 22, '$s7': 23,
      '$t8': 24, '$t9': 25,
      '$k0': 26, '$k1': 27,
      '$gp': 28, '$sp': 29, '$fp': 30, '$ra': 31
    };

    if (regMap[clean] !== undefined) return regMap[clean];

    // Deteksi FPU register ($f0 - $f31)
    if (clean.startsWith('$f')) {
      const num = parseInt(clean.substring(2), 10);
      if (!isNaN(num) && num >= 0 && num <= 31) return num;
    }
    // Deteksi angka mentah (e.g., $8 atau 8)
    if (clean.startsWith('$')) {
      const num = parseInt(clean.substring(1), 10);
      if (!isNaN(num)) return num;
    } else {
      const num = parseInt(clean, 10);
      if (!isNaN(num)) return num;
    }

    throw new Error(`[Syntax Error] Not valid Register: "${regStr}"`);
  }

  /**
   * ========================================================================
   * STRICT SECURITY GATE 2: Label & Immediate Validation
   * ========================================================================
   */
  private parseImmediateOrLabel(valStr: string, symbols: Record<string, number>): number {
    if (!valStr) throw new Error(`[Syntax Error] Argument label/immediate missing!`);
    
    const num = parseInt(valStr, 10);
    if (!isNaN(num)) return num;

    if (symbols[valStr] !== undefined) return symbols[valStr];

    throw new Error(`[Reference Error] Label is not found: "${valStr}"`);
  }

  /**
   * ========================================================================
   * 2. MAIN COMPILER (TWO-PASS ASSEMBLER)
   * ========================================================================
   */
  public compile(rawCode: string, entryFilename: string = 'main.s') {
    // STAGE 0: Eksekusi Preprocessor (Gabungkan semua file .include)
    const initialVisited = new Set<string>([entryFilename]);
    const code = this.preprocess(rawCode, initialVisited);
    const lines = code.split('\n');

    const symbols: Record<string, number> = {};
    const data: any[] = [];
    const instructions: any[] = [];

    let currentSection: 'text' | 'data' = 'text';
    let textAddress = TEXT_BASE; 
    let dataAddress = DATA_BASE; 

    // ----------------------------------------------------------------------
    // PASS 1: LABEL COLLECTION, MEMORY ALLOCATION & MACRO PREDICTION
    // ----------------------------------------------------------------------
    let pendingLabels: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].split('#')[0].trim();
      if (!line) continue;

      if (line === '.data') { currentSection = 'data'; continue; }
      if (line === '.text') { currentSection = 'text'; continue; }
      if (line.startsWith('.globl')) continue;

      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (labelMatch) {
        pendingLabels.push(labelMatch[1]);
        line = line.substring(labelMatch[0].length).trim();
        if (!line) continue;
      }

      if (currentSection === 'data') {
        if (line.startsWith('.word') || line.startsWith('.float')) {
          const rem = dataAddress % 4;
          if (rem !== 0) dataAddress += (4 - rem);
        }

        for (const lbl of pendingLabels) symbols[lbl] = dataAddress;
        pendingLabels = [];

        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) {
            let rawStr = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            let byteLength = rawStr.length + 1; 
            const bytes = new Uint8Array(byteLength);
            for (let b = 0; b < rawStr.length; b++) bytes[b] = rawStr.charCodeAt(b);
            bytes[rawStr.length] = 0;

            data.push({ address: dataAddress, data: bytes });
            dataAddress += byteLength;
          } else throw new Error(`[Syntax Error] Format .asciiz is not valid on line ${i+1}`);
        } 
        else if (line.startsWith('.float')) {
          const match = line.match(/\.float\s+([-\d.eE]+)/);
          if (match) {
            const floatVal = parseFloat(match[1]);
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);
            view.setFloat32(0, floatVal, false); 
            
            const bytes = new Uint8Array(4);
            for(let b=0; b<4; b++) bytes[b] = view.getUint8(b);
            
            data.push({ address: dataAddress, data: bytes });
            dataAddress += 4;
          } else throw new Error(`[Syntax Error] Format .float is not valid on line ${i+1}`);
        }
        else if (line.startsWith('.word')) {
          const parts = line.replace(/,/g, ' ').split(/\s+/).slice(1);
          for (const p of parts) {
             if (!p) continue;
             const val = parseInt(p, 10) || 0;
             const buffer = new ArrayBuffer(4);
             const view = new DataView(buffer);
             view.setInt32(0, val, false); 
             
             const bytes = new Uint8Array(4);
             for(let b=0; b<4; b++) bytes[b] = view.getUint8(b);
             
             data.push({ address: dataAddress, data: bytes });
             dataAddress += 4;
          }
        }
      } 
      else {
        for (const lbl of pendingLabels) symbols[lbl] = textAddress;
        pendingLabels = [];

        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const mnemonic = parts[0].toLowerCase();
        let instrSize = 4;
        
        if (mnemonic === 'la') instrSize = 8;
        else if (['lw', 'sw', 'lwc1', 'swc1'].includes(mnemonic) && !parts[2]?.includes('(')) instrSize = 8;
        else if (mnemonic === 'bge' || mnemonic === 'blt') instrSize = 8;
        else if (mnemonic === 'li') {
           const isLabel = isNaN(parseInt(parts[2], 10));
           const immVal = parseInt(parts[2], 10);
           if (isLabel || immVal > 32767 || immVal < -32768) instrSize = 8;
        }

        textAddress += instrSize; 
      }
    }

    // ----------------------------------------------------------------------
    // PASS 2: TRANSLATE INSTRUCTIONS (.text) -> MACHINE CODE
    // ----------------------------------------------------------------------
    textAddress = TEXT_BASE; 
    currentSection = 'text'; 

    for (let i = 0; i < lines.length; i++) {
      let originalText = lines[i].trim();
      let line = lines[i].split('#')[0].trim();
      if (!line) continue;

      if (line === '.data' || line === '.text' || line.startsWith('.globl')) {
        if (line === '.data') currentSection = 'data';
        if (line === '.text') currentSection = 'text';
        continue;
      }

      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (labelMatch) {
        line = line.substring(labelMatch[0].length).trim();
        if (!line) continue;
      }

      if (currentSection === 'text') {
         const parts = line.replace(/,/g, ' ').split(/\s+/);
         const mnemonic = parts[0].toLowerCase();

         const emit = (mCode: number, textToDisplay: string) => {
           instructions.push({
             address: textAddress,
             machineCode: mCode,
             hexString: (mCode >>> 0).toString(16).padStart(8, '0'),
             originalText: textToDisplay, 
             originalLine: i + 1
           });
           textAddress += 4;
         };

         if (mnemonic === 'nop') emit(0, originalText);
         else if (mnemonic === 'syscall') emit(0x0c, originalText);
         
         // ALU Operations
         else if (['add', 'sub', 'and', 'or', 'slt'].includes(mnemonic)) {
           const rd = this.parseRegister(parts[1]);
           const rs = this.parseRegister(parts[2]);
           const rt = this.parseRegister(parts[3]);
           let funct = 0x20;
           if (mnemonic === 'sub') funct = 0x22;
           if (mnemonic === 'and') funct = 0x24;
           if (mnemonic === 'or')  funct = 0x25;
           if (mnemonic === 'slt') funct = 0x2a;
           emit((0 << 26) | (rs << 21) | (rt << 16) | (rd << 11) | (0 << 6) | funct, originalText);
         }
         else if (['addi', 'addiu', 'slti', 'andi', 'ori'].includes(mnemonic)) {
           const rt = this.parseRegister(parts[1]);
           const rs = this.parseRegister(parts[2]);
           const imm = this.parseImmediateOrLabel(parts[3], symbols);
           let op = 0x08; 
           if (mnemonic === 'addiu') op = 0x09;
           if (mnemonic === 'slti')  op = 0x0a;
           if (mnemonic === 'andi')  op = 0x0c;
           if (mnemonic === 'ori')   op = 0x0d;
           emit((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xFFFF), originalText);
         }
         else if (mnemonic === 'move') {
           const rd = this.parseRegister(parts[1]);
           const rs = this.parseRegister(parts[2]);
           emit((0 << 26) | (rs << 21) | (0 << 16) | (rd << 11) | (0 << 6) | 0x20, originalText);
         }
         else if (mnemonic === 'la' || mnemonic === 'li') {
           const rt = this.parseRegister(parts[1]);
           const targetAddr = this.parseImmediateOrLabel(parts[2], symbols);

           if (mnemonic === 'la' || targetAddr > 32767 || targetAddr < -32768) {
               const upper = (targetAddr >>> 16) & 0xFFFF;
               const lower = targetAddr & 0xFFFF;
               emit((0x0f << 26) | (0 << 21) | (1 << 16) | upper, `lui $at, 0x${upper.toString(16)}`);
               emit((0x0d << 26) | (1 << 21) | (rt << 16) | lower, `ori ${parts[1]}, $at, 0x${lower.toString(16)}`);
           } else {
               emit((0x09 << 26) | (0 << 21) | (rt << 16) | (targetAddr & 0xFFFF), originalText); 
           }
         }
         
         // Memory Access
         else if (['lw', 'sw', 'lwc1', 'swc1'].includes(mnemonic)) {
            let op = 0;
            if (mnemonic === 'lw')   op = 0x23;
            if (mnemonic === 'sw')   op = 0x2b;
            if (mnemonic === 'lwc1') op = 0x31;
            if (mnemonic === 'swc1') op = 0x39;

            const rt = this.parseRegister(parts[1]);
            const memMatch = parts[2] ? parts[2].match(/^([-\d]+)\((.+)\)$/) : null;

            if (memMatch) {
                const imm = parseInt(memMatch[1], 10);
                const rs = this.parseRegister(memMatch[2]);
                emit((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xFFFF), originalText);
            } else {
                const targetAddr = this.parseImmediateOrLabel(parts[2], symbols);
                const upper = (targetAddr >>> 16) & 0xFFFF;
                const lower = targetAddr & 0xFFFF;
                emit((0x0f << 26) | (0 << 21) | (1 << 16) | upper, `lui $at, 0x${upper.toString(16)}`);
                emit((op << 26) | (1 << 21) | (rt << 16) | lower, `${mnemonic} ${parts[1]}, 0x${lower.toString(16)}($at)`);
            }
         }
         
         // Branching & Jumping
         else if (mnemonic === 'j' || mnemonic === 'jal') {
           const targetAddr = this.parseImmediateOrLabel(parts[1], symbols);
           const op = mnemonic === 'j' ? 0x02 : 0x03;
           const addressValue = (targetAddr >>> 2) & 0x03FFFFFF; 
           emit((op << 26) | addressValue, originalText);
         }
         else if (mnemonic === 'jr') {
           const rs = this.parseRegister(parts[1]);
           emit((0 << 26) | (rs << 21) | (0 << 16) | (0 << 11) | (0 << 6) | 0x08, originalText);
         }
         else if (['beq', 'bne', 'bge', 'blt'].includes(mnemonic)) {
            let op = mnemonic === 'beq' ? 0x04 : (mnemonic === 'bne' ? 0x05 : 0);
            const rs = this.parseRegister(parts[1]);
            const rt = this.parseRegister(parts[2]);
            const targetAddr = this.parseImmediateOrLabel(parts[3], symbols);

            if (op !== 0) { 
                const offset = ((targetAddr - (textAddress + 4)) >> 2) & 0xFFFF;
                emit((op << 26) | (rs << 21) | (rt << 16) | offset, originalText);
            } else { 
                const offset = ((targetAddr - (textAddress + 8)) >> 2) & 0xFFFF; 
                if (mnemonic === 'bge') { 
                    emit((0 << 26) | (rs << 21) | (rt << 16) | (1 << 11) | (0 << 6) | 0x2a, `slt $at, ${parts[1]}, ${parts[2]}`);
                    emit((0x04 << 26) | (1 << 21) | (0 << 16) | offset, `beq $at, $zero, ${parts[3]}`);
                } else if (mnemonic === 'blt') { 
                    emit((0 << 26) | (rs << 21) | (rt << 16) | (1 << 11) | (0 << 6) | 0x2a, `slt $at, ${parts[1]}, ${parts[2]}`);
                    emit((0x05 << 26) | (1 << 21) | (0 << 16) | offset, `bne $at, $zero, ${parts[3]}`);
                }
            }
         }
         
         // ========================================================================
         // NEW FEATURE: COPROCESSOR 1 (FPU - Floating Point Instructions)
         // ========================================================================
         else if (['mfc1', 'mtc1'].includes(mnemonic)) {
            const rt = this.parseRegister(parts[1]); // Int register
            const fs = this.parseRegister(parts[2]); // Float register
            const fmt = mnemonic === 'mfc1' ? 0x00 : 0x04;
            emit((0x11 << 26) | (fmt << 21) | (rt << 16) | (fs << 11) | (0 << 6) | 0x00, originalText);
         }
         else if (['add.s', 'sub.s', 'mul.s', 'div.s'].includes(mnemonic)) {
            const fd = this.parseRegister(parts[1]);
            const fs = this.parseRegister(parts[2]);
            const ft = this.parseRegister(parts[3]);
            let funct = 0x00;
            if (mnemonic === 'sub.s') funct = 0x01;
            if (mnemonic === 'mul.s') funct = 0x02;
            if (mnemonic === 'div.s') funct = 0x03;
            // Opcode 0x11, Format 0x10 (Single Precision)
            emit((0x11 << 26) | (0x10 << 21) | (ft << 16) | (fs << 11) | (fd << 6) | funct, originalText);
         }
         
         // ========================================================================
         // STRICT SECURITY GATE 3: Catch Unknown/Invalid Instructions
         // ========================================================================
         else {
           throw new Error(`[Syntax Error] Not valid instruction: "${mnemonic}" on line ${i + 1}\n=> ${originalText}`);
         }
      }
    }

    return { instructions, data, symbols };
  }
}