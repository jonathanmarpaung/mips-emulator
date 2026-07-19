export const SEGMENT_TEXT_START = 0x00400000;
export const SEGMENT_DATA_START = 0x10010000;

export interface AssembledInstruction {
  address: number;
  machineCode: number;
  hexString: string;
  originalText: string;
  originalLine: number; // Mapping ke baris di Monaco Editor
}

export interface AssembledData {
  address: number;
  data: Uint8Array;
}

export interface LineNode {
  text: string;
  lineNo: number;
}

const REG_MAP: Record<string, number> = {
  '$zero': 0, '$0': 0, '$at': 1, '$1': 1,
  '$v0': 2, '$2': 2, '$v1': 3, '$3': 3,
  '$a0': 4, '$4': 4, '$a1': 5, '$5': 5, '$a2': 6, '$6': 6, '$a3': 7, '$7': 7,
  '$t0': 8, '$8': 8, '$t1': 9, '$9': 9, '$t2': 10, '$10': 10, '$t3': 11, '$11': 11,
  '$t4': 12, '$12': 12, '$t5': 13, '$13': 13, '$t6': 14, '$14': 14, '$t7': 15, '$15': 15,
  '$s0': 16, '$16': 16, '$s1': 17, '$17': 17, '$s2': 18, '$18': 18, '$s3': 19, '$19': 19,
  '$s4': 20, '$20': 20, '$s5': 21, '$21': 21, '$s6': 22, '$22': 22, '$s7': 23, '$23': 23,
  '$t8': 24, '$24': 24, '$t9': 25, '$25': 25,
  '$k0': 26, '$26': 26, '$k1': 27, '$27': 27,
  '$gp': 28, '$28': 28, '$sp': 29, '$29': 29, '$fp': 30, '$30': 30, '$ra': 31, '$31': 31
};

export class Assembler {
  private symbolTable: Map<string, number>;
  private instructions: AssembledInstruction[];
  private dataSegment: AssembledData[];

  constructor() {
    this.symbolTable = new Map();
    this.instructions = [];
    this.dataSegment = [];
  }

  public compile(sourceCode: string) {
    this.symbolTable.clear();
    this.instructions = [];
    this.dataSegment = [];

    const expandedLines = this.preprocessMacros(sourceCode);
    this.passOne(expandedLines);
    this.passTwo(expandedLines);

    return {
      instructions: this.instructions,
      data: this.dataSegment,
      symbols: Object.fromEntries(this.symbolTable)
    };
  }

  private preprocessMacros(sourceCode: string): LineNode[] {
    const lines = sourceCode.split('\n');
    const expandedLines: LineNode[] = [];
    const macros = new Map<string, { args: string[], body: LineNode[] }>();

    let inMacro = false;
    let currentMacroName = '';
    let currentMacroArgs: string[] = [];
    let currentMacroBody: LineNode[] = [];

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('.macro')) {
        inMacro = true;
        const macroMatch = trimmedLine.match(/\.macro\s+([a-zA-Z_0-9]+)\s*\((.*)\)/) || trimmedLine.match(/\.macro\s+([a-zA-Z_0-9]+)/);
        if (macroMatch) {
          currentMacroName = macroMatch[1];
          currentMacroArgs = macroMatch[2] ? macroMatch[2].split(',').map(arg => arg.trim()) : [];
          currentMacroBody = [];
        }
        return;
      }

      if (trimmedLine === '.end_macro') {
        inMacro = false;
        macros.set(currentMacroName, { args: currentMacroArgs, body: currentMacroBody });
        return;
      }

      if (inMacro) {
        currentMacroBody.push({ text: line, lineNo });
        return;
      }

      let isMacroInvocation = false;
      for (const [macroName, macroData] of macros.entries()) {
        const invokeRegex = new RegExp(`^${macroName}\\s*\\((.*)\\)`);
        const invokeMatch = trimmedLine.match(invokeRegex);

        if (invokeMatch) {
          isMacroInvocation = true;
          const providedArgs = invokeMatch[1] ? invokeMatch[1].split(',').map(arg => arg.trim()) : [];
          for (const bodyNode of macroData.body) {
            let expandedText = bodyNode.text;
            macroData.args.forEach((param, index) => {
              const paramRegex = new RegExp(param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              expandedText = expandedText.replace(paramRegex, providedArgs[index] || '');
            });
            expandedLines.push({ text: expandedText, lineNo }); // Map ke baris pemanggilan macro
          }
          break;
        }
      }

      if (!isMacroInvocation) {
        expandedLines.push({ text: line, lineNo });
      }
    });

    return expandedLines;
  }

  private passOne(lines: LineNode[]) {
    let currentSegment = '.text';
    let textAddress = SEGMENT_TEXT_START;
    let dataAddress = SEGMENT_DATA_START;

    for (const node of lines) {
      let line = this.cleanLine(node.text);
      if (!line) continue;
      if (line === '.text' || line === '.data') { currentSegment = line; continue; }
      if (line.startsWith('.set') || line.startsWith('.global') || line.startsWith('.globl')) continue;

      const labelMatch = line.match(/^([a-zA-Z_0-9]+):(.*)$/);
      if (labelMatch) {
        this.symbolTable.set(labelMatch[1], currentSegment === '.text' ? textAddress : dataAddress);
        line = labelMatch[2].trim();
        if (!line) continue;
      }

      if (currentSegment === '.text') {
        const opcode = line.split(/\s+/)[0].toLowerCase();
        if (opcode === 'la') textAddress += 8;
        else if (['bgt', 'blt', 'bge', 'ble'].includes(opcode)) textAddress += 8; 
        else textAddress += 4;
      } else if (currentSegment === '.data') {
        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) dataAddress += strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').length + 1;
        } else if (line.startsWith('.ascii ') && !line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.ascii\s+"(.*)"/);
          if (strMatch) dataAddress += strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').length;
        } else if (line.startsWith('.byte')) {
          dataAddress += line.substring(5).split(',').length;
        } else if (line.startsWith('.half')) {
          dataAddress += ((2 - (dataAddress % 2)) % 2) + (line.substring(5).split(',').length * 2);
        } else if (line.startsWith('.word')) {
          dataAddress += ((4 - (dataAddress % 4)) % 4) + (line.substring(5).split(',').length * 4);
        } else if (line.startsWith('.space')) {
          dataAddress += parseInt(line.substring(6).trim(), 10);
        } else if (line.startsWith('.align')) {
          const n = parseInt(line.substring(6).trim(), 10);
          const bound = Math.pow(2, n);
          dataAddress += (bound - (dataAddress % bound)) % bound;
        }
      }
    }
  }

  private passTwo(lines: LineNode[]) {
    let currentSegment = '.text';
    let textAddress = SEGMENT_TEXT_START;
    let dataAddress = SEGMENT_DATA_START;

    for (const node of lines) {
      const originalText = node.text;
      let line = this.cleanLine(originalText);
      
      if (!line || line === '.text' || line === '.data') {
        if (line === '.text' || line === '.data') currentSegment = line;
        continue;
      }
      line = line.replace(/^([a-zA-Z_0-9]+):\s*/, '');
      if (!line || line.startsWith('.set') || line.startsWith('.global') || line.startsWith('.globl')) continue;

      if (currentSegment === '.text') {
        const codes = this.encodeInstruction(line, textAddress);
        for (const code of codes) {
          this.instructions.push({
            address: textAddress,
            machineCode: code,
            hexString: code.toString(16).padStart(8, '0'),
            originalText: originalText.trim(),
            originalLine: node.lineNo // Simpan referensi ke baris asli di editor
          });
          textAddress += 4;
        }
      } else if (currentSegment === '.data') {
        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) {
            let str = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            const bytes = new Uint8Array(str.length + 1);
            for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
            this.dataSegment.push({ address: dataAddress, data: bytes });
            dataAddress += bytes.length;
          }
        } else if (line.startsWith('.ascii ') && !line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.ascii\s+"(.*)"/);
          if (strMatch) {
            let str = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
            this.dataSegment.push({ address: dataAddress, data: bytes });
            dataAddress += bytes.length;
          }
        } else if (line.startsWith('.byte')) {
          const values = line.substring(5).split(',').map(v => Number(v.trim()));
          this.dataSegment.push({ address: dataAddress, data: new Uint8Array(values) });
          dataAddress += values.length;
        } else if (line.startsWith('.half')) {
          const padding = (2 - (dataAddress % 2)) % 2;
          dataAddress += padding;
          const values = line.substring(5).split(',').map(v => Number(v.trim()));
          const bytes = new Uint8Array(values.length * 2);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < values.length; i++) view.setUint16(i * 2, values[i] >>> 0, false);
          this.dataSegment.push({ address: dataAddress, data: bytes });
          dataAddress += bytes.length;
        } else if (line.startsWith('.word')) {
          const padding = (4 - (dataAddress % 4)) % 4;
          dataAddress += padding;
          const values = line.substring(5).split(',').map(v => Number(v.trim()));
          const bytes = new Uint8Array(values.length * 4);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < values.length; i++) view.setUint32(i * 4, values[i] >>> 0, false);
          this.dataSegment.push({ address: dataAddress, data: bytes });
          dataAddress += bytes.length;
        } else if (line.startsWith('.space')) {
          const size = parseInt(line.substring(6).trim(), 10);
          this.dataSegment.push({ address: dataAddress, data: new Uint8Array(size) });
          dataAddress += size;
        } else if (line.startsWith('.align')) {
          const n = parseInt(line.substring(6).trim(), 10);
          const bound = Math.pow(2, n);
          dataAddress += (bound - (dataAddress % bound)) % bound;
        }
      }
    }
  }

  private encodeInstruction(instruction: string, pc: number): number[] {
    const parts = instruction.replace(/,/g, ' ').trim().split(/\s+/);
    const opcode = parts[0].toLowerCase();
    const getReg = (regName: string) => REG_MAP[regName] || 0;

    const parseMemArg = (arg: string) => {
      const match = arg.match(/^(-?(?:0x[0-9a-fA-F]+|\d+))\(([a-zA-Z0-9_$]+)\)$/);
      if (match) return { offset: Number(match[1]) & 0xFFFF, reg: getReg(match[2]) };
      return { offset: 0, reg: 0 };
    };

    switch (opcode) {
      case 'li': return [(9 << 26) | (0 << 21) | (getReg(parts[1]) << 16) | (Number(parts[2]) & 0xFFFF)];
      case 'la': 
        const rtLa = getReg(parts[1]);
        const laAddr = this.symbolTable.get(parts[2]) || 0;
        return [
          (0x0F << 26) | (0 << 21) | (1 << 16) | ((laAddr >>> 16) & 0xFFFF),
          (0x0D << 26) | (1 << 21) | (rtLa << 16) | (laAddr & 0xFFFF)
        ];
      case 'move':  return [(0 << 26) | (getReg(parts[2]) << 21) | (0 << 16) | (getReg(parts[1]) << 11) | 0x20];
      case 'syscall': return [0x0000000c]; 

      case 'add':   return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x20];
      case 'addu':  return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x21];
      case 'sub':   return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x22];
      case 'subu':  return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x23];
      case 'and':   return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x24];
      case 'or':    return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x25];
      case 'mult':  return [(0 << 26) | (getReg(parts[1]) << 21) | (getReg(parts[2]) << 16) | (0 << 11) | 0x18];
      case 'div':   return [(0 << 26) | (getReg(parts[1]) << 21) | (getReg(parts[2]) << 16) | (0 << 11) | 0x1A];
      case 'sll':   return [(0 << 26) | (0 << 21) | (getReg(parts[2]) << 16) | (getReg(parts[1]) << 11) | ((Number(parts[3]) & 0x1F) << 6) | 0x00];
      case 'srl':   return [(0 << 26) | (0 << 21) | (getReg(parts[2]) << 16) | (getReg(parts[1]) << 11) | ((Number(parts[3]) & 0x1F) << 6) | 0x02];
      case 'slt':   return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x2A];
      case 'mflo':  return [(0 << 26) | (0 << 21) | (0 << 16) | (getReg(parts[1]) << 11) | 0x12];
      case 'mfhi':  return [(0 << 26) | (0 << 21) | (0 << 16) | (getReg(parts[1]) << 11) | 0x10];
      case 'mul':   return [(28 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x02];

      case 'addi':  return [(8 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];
      case 'addiu': return [(9 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];
      case 'andi':  return [(12 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];
      case 'ori':   return [(13 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];
      case 'xori':  return [(14 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];
      case 'lui':   return [(15 << 26) | (0 << 21) | (getReg(parts[1]) << 16) | (Number(parts[2]) & 0xFFFF)];
      case 'slti':  return [(10 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (Number(parts[3]) & 0xFFFF)];

      case 'sw':    
      case 'lw':    
      case 'lb':    
      case 'sb': {  
        const mem = parseMemArg(parts[2]);
        let op = 0;
        if (opcode === 'sw') op = 43; else if (opcode === 'lw') op = 35; else if (opcode === 'lb') op = 32; else if (opcode === 'sb') op = 40;
        return [(op << 26) | (mem.reg << 21) | (getReg(parts[1]) << 16) | mem.offset];
      }

      case 'beq': {
        const beqOffset = (((this.symbolTable.get(parts[3]) || 0) - (pc + 4)) >> 2) & 0xFFFF;
        return [(4 << 26) | (getReg(parts[1]) << 21) | (getReg(parts[2]) << 16) | beqOffset];
      }
      case 'bne': {
        const bneOffset = (((this.symbolTable.get(parts[3]) || 0) - (pc + 4)) >> 2) & 0xFFFF;
        return [(5 << 26) | (getReg(parts[1]) << 21) | (getReg(parts[2]) << 16) | bneOffset];
      }
      case 'j':     
      case 'jal': { 
        const jIndex = ((this.symbolTable.get(parts[1]) || 0) >>> 2) & 0x03FFFFFF;
        const jOp = opcode === 'j' ? 2 : 3;
        return [(jOp << 26) | jIndex];
      }
      case 'jr':    return [(0 << 26) | (getReg(parts[1]) << 21) | (0 << 16) | (0 << 11) | 0x08];

      case 'bgt':
      case 'blt':
      case 'bge':
      case 'ble': {
        const r1 = getReg(parts[1]); const r2 = getReg(parts[2]);
        const bTarget = (((this.symbolTable.get(parts[3]) || 0) - (pc + 8)) >> 2) & 0xFFFF;
        const rs_slt = (opcode === 'bgt' || opcode === 'ble') ? r2 : r1;
        const rt_slt = (opcode === 'bgt' || opcode === 'ble') ? r1 : r2;
        const branchOp = (opcode === 'bgt' || opcode === 'blt') ? 5 : 4; 
        return [
          (0 << 26) | (rs_slt << 21) | (rt_slt << 16) | (1 << 11) | 0x2A, 
          (branchOp << 26) | (1 << 21) | (0 << 16) | bTarget              
        ];
      }

      default: return [0x00000000];
    }
  }

  private cleanLine(line: string): string {
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) line = line.substring(0, commentIndex);
    return line.trim();
  }
}