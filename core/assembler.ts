import { DATA_BASE, TEXT_BASE } from './memory';

export class Assembler {
  
  /**
   * ========================================================================
   * 1. PREPROCESSOR (Handling .include directives)
   * Recursively injects file contents and prevents Circular Inclusion.
   * ========================================================================
   */
  private preprocess(code: string, visitedFiles: Set<string> = new Set(['main.s'])): string {
    const lines = code.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect pattern: .include "filename.s"
      const includeMatch = line.match(/^\s*\.include\s+"([^"]+)"/);

      if (includeMatch) {
        const filename = includeMatch[1];

        // Absolute Protection: Prevent Infinite Loop (A -> B -> A)
        if (visitedFiles.has(filename)) {
          throw new Error(`[Preprocessor Error] Circular include detected in file: "${filename}"`);
        }

        // Fetch text content from Virtual File System (localStorage)
        const fileKey = `mips_fs_${filename}`;
        const fileContent = localStorage.getItem(fileKey);

        if (fileContent === null) {
          throw new Error(`[Preprocessor Error] File not found: "${filename}". Please ensure it exists in the Workspace.`);
        }

        const newVisited = new Set(visitedFiles);
        newVisited.add(filename);

        // Recursive call: If the included file has its own .include directives
        const processedInclude = this.preprocess(fileContent, newVisited);
        
        // Inject the file content with comment markers for debugging purposes
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
   * Throws an error if the register format is unrecognized.
   * ========================================================================
   */
  private parseRegister(regStr: string): number {
    if (!regStr) throw new Error(`[Syntax Error] Missing register argument!`);
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

    // Detect FPU registers ($f0 - $f31)
    if (clean.startsWith('$f')) {
      const num = parseInt(clean.substring(2), 10);
      if (!isNaN(num) && num >= 0 && num <= 31) return num;
    }
    // Detect raw numerical registers (e.g., $8 or just 8)
    if (clean.startsWith('$')) {
      const num = parseInt(clean.substring(1), 10);
      if (!isNaN(num)) return num;
    } else {
      const num = parseInt(clean, 10);
      if (!isNaN(num)) return num;
    }

    throw new Error(`[Syntax Error] Invalid or unknown register: "${regStr}"`);
  }

  /**
   * ========================================================================
   * STRICT SECURITY GATE 2: Label & Immediate Validation
   * ========================================================================
   */
  private parseImmediateOrLabel(valStr: string, symbols: Record<string, number>): number {
    if (!valStr) throw new Error(`[Syntax Error] Missing immediate or label argument!`);
    
    // Check if it's a raw number
    const num = parseInt(valStr, 10);
    if (!isNaN(num)) return num;

    // Check if it's a declared label
    if (symbols[valStr] !== undefined) return symbols[valStr];

    throw new Error(`[Reference Error] Unresolved label reference: "${valStr}"`);
  }

  /**
   * ========================================================================
   * 2. MAIN COMPILER (TWO-PASS ASSEMBLER)
   * ========================================================================
   */
  public compile(rawCode: string) {
    // STAGE 0: Execute Preprocessor (Merge all .include files)
    const code = this.preprocess(rawCode);
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
      let line = lines[i].split('#')[0].trim(); // Strip comments
      if (!line) continue;

      if (line === '.data') { currentSection = 'data'; continue; }
      if (line === '.text') { currentSection = 'text'; continue; }
      if (line.startsWith('.globl')) continue;

      // Extract labels (e.g., "main:")
      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (labelMatch) {
        pendingLabels.push(labelMatch[1]);
        line = line.substring(labelMatch[0].length).trim();
        if (!line) continue;
      }

      if (currentSection === 'data') {
        // AUTO-ALIGNMENT: Ensure floats and words are placed on word boundaries (multiple of 4)
        if (line.startsWith('.word') || line.startsWith('.float')) {
          const rem = dataAddress % 4;
          if (rem !== 0) dataAddress += (4 - rem);
        }

        // Bind pending labels to the aligned data address
        for (const lbl of pendingLabels) symbols[lbl] = dataAddress;
        pendingLabels = [];

        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) {
            let rawStr = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            let byteLength = rawStr.length + 1; // +1 for \0 Null Terminator
            
            const bytes = new Uint8Array(byteLength);
            for (let b = 0; b < rawStr.length; b++) bytes[b] = rawStr.charCodeAt(b);
            bytes[rawStr.length] = 0;

            data.push({ address: dataAddress, data: bytes });
            dataAddress += byteLength;
          } else {
             throw new Error(`[Syntax Error] Invalid .asciiz format on line ${i+1}`);
          }
        } 
        else if (line.startsWith('.float')) {
          const match = line.match(/\.float\s+([-\d.eE]+)/);
          if (match) {
            const floatVal = parseFloat(match[1]);
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);
            view.setFloat32(0, floatVal, false); // false = Big-Endian
            
            const bytes = new Uint8Array(4);
            for(let b=0; b<4; b++) bytes[b] = view.getUint8(b);
            
            data.push({ address: dataAddress, data: bytes });
            dataAddress += 4;
          } else {
            throw new Error(`[Syntax Error] Invalid .float format on line ${i+1}`);
          }
        }
        else if (line.startsWith('.word')) {
          // Basic support for array of words: .word 10, 20, 30
          const parts = line.replace(/,/g, ' ').split(/\s+/).slice(1);
          for (const p of parts) {
             if (!p) continue;
             const val = parseInt(p, 10) || 0;
             const buffer = new ArrayBuffer(4);
             const view = new DataView(buffer);
             view.setInt32(0, val, false); // false = Big-Endian
             
             const bytes = new Uint8Array(4);
             for(let b=0; b<4; b++) bytes[b] = view.getUint8(b);
             
             data.push({ address: dataAddress, data: bytes });
             dataAddress += 4;
          }
        }
      } 
      else {
        // Bind pending labels to the current instruction address
        for (const lbl of pendingLabels) symbols[lbl] = textAddress;
        pendingLabels = [];

        const parts = line.replace(/,/g, ' ').split(/\s+/);
        const mnemonic = parts[0].toLowerCase();
        
        let instrSize = 4;
        
        // MACRO PREDICTION: Accurately estimate address shifts for pseudo-instructions
        if (mnemonic === 'la') {
            instrSize = 8; // la always expands to lui + ori
        }
        else if (['lw', 'sw', 'lwc1', 'swc1'].includes(mnemonic)) {
           // If it lacks '(', it is using a macro label (e.g., lwc1 $f12, pi) -> 8 bytes
           if (!parts[2]?.includes('(')) instrSize = 8;
        }
        else if (mnemonic === 'bge' || mnemonic === 'blt') {
            instrSize = 8; // Expands to slt + beq/bne
        }
        else if (mnemonic === 'li') {
           const isLabel = isNaN(parseInt(parts[2], 10));
           const immVal = parseInt(parts[2], 10);
           // If it references a label or a 32-bit immediate, it expands to 8 bytes
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

      if (line === '.data') { currentSection = 'data'; continue; }
      if (line === '.text') { currentSection = 'text'; continue; }
      if (line.startsWith('.globl')) continue;

      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (labelMatch) {
        line = line.substring(labelMatch[0].length).trim();
        if (!line) continue;
      }

      if (currentSection === 'text') {
         const parts = line.replace(/,/g, ' ').split(/\s+/);
         const mnemonic = parts[0].toLowerCase();

         // Smart Helper to push instruction to memory array
         const emit = (mCode: number, textToDisplay: string) => {
           instructions.push({
             address: textAddress,
             machineCode: mCode,
             hexString: (mCode >>> 0).toString(16).padStart(8, '0'),
             originalText: textToDisplay, // Adjusts dynamically for macro expansions
             originalLine: i + 1
           });
           textAddress += 4;
         };

         if (mnemonic === 'nop') { emit(0, originalText); }
         else if (mnemonic === 'syscall') { emit(0x0c, originalText); }
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

           // 'la' always uses lui+ori. 'li' uses it if > 16-bit or label reference
           if (mnemonic === 'la' || targetAddr > 32767 || targetAddr < -32768) {
               const upper = (targetAddr >>> 16) & 0xFFFF;
               const lower = targetAddr & 0xFFFF;
               emit((0x0f << 26) | (0 << 21) | (1 << 16) | upper, `lui $at, 0x${upper.toString(16)}`);
               emit((0x0d << 26) | (1 << 21) | (rt << 16) | lower, `ori ${parts[1]}, $at, 0x${lower.toString(16)}`);
           } else {
               // Simple 'li' fits in a single addiu instruction
               emit((0x09 << 26) | (0 << 21) | (rt << 16) | (targetAddr & 0xFFFF), originalText); 
           }
         }
         else if (['lw', 'sw', 'lwc1', 'swc1'].includes(mnemonic)) {
            let op = 0;
            if (mnemonic === 'lw')   op = 0x23;
            if (mnemonic === 'sw')   op = 0x2b;
            if (mnemonic === 'lwc1') op = 0x31;
            if (mnemonic === 'swc1') op = 0x39;

            const rt = this.parseRegister(parts[1]);
            const memMatch = parts[2] ? parts[2].match(/^([-\d]+)\((.+)\)$/) : null;

            if (memMatch) {
                // Standard offset format: 0($t0)
                const imm = parseInt(memMatch[1], 10);
                const rs = this.parseRegister(memMatch[2]);
                emit((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xFFFF), originalText);
            } else {
                // Macro format: lwc1 $f12, pi  ->  Expands to LUI + LWC1
                const targetAddr = this.parseImmediateOrLabel(parts[2], symbols);
                const upper = (targetAddr >>> 16) & 0xFFFF;
                const lower = targetAddr & 0xFFFF;
                emit((0x0f << 26) | (0 << 21) | (1 << 16) | upper, `lui $at, 0x${upper.toString(16)}`);
                emit((op << 26) | (1 << 21) | (rt << 16) | lower, `${mnemonic} ${parts[1]}, 0x${lower.toString(16)}($at)`);
            }
         }
         else if (mnemonic === 'j' || mnemonic === 'jal') {
           const targetAddr = this.parseImmediateOrLabel(parts[1], symbols);
           const op = mnemonic === 'j' ? 0x02 : 0x03;
           const addressValue = (targetAddr >>> 2) & 0x03FFFFFF; // Word-aligned shift
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
                // Pure branch instructions (beq, bne)
                const offset = ((targetAddr - (textAddress + 4)) >> 2) & 0xFFFF;
                emit((op << 26) | (rs << 21) | (rt << 16) | offset, originalText);
            } else { 
                // Macro branch instructions (bge, blt) expanding into slt + beq/bne
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
         // STRICT SECURITY GATE 3: Catch Unknown/Invalid Instructions
         // ========================================================================
         else {
           throw new Error(`[Syntax Error] Unknown instruction or invalid format: "${mnemonic}" on line ${i + 1}\n=> ${originalText}`);
         }
      }
    }

    return { instructions, data, symbols };
  }
}