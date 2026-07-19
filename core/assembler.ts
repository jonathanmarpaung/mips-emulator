import { TEXT_BASE, DATA_BASE, RDATA_BASE } from './memory';

export interface AssembledInstruction {
  address: number;
  machineCode: number;
  hexString: string;
  originalText: string;
  originalLine: number; 
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
  '$gp': 28, '$28': 28, '$sp': 29, '$29': 29, '$fp': 30, '$30': 30, '$ra': 31, '$31': 31,
  '$f0': 0, '$f1': 1, '$f2': 2, '$f3': 3, '$f4': 4, '$f5': 5, '$f6': 6, '$f7': 7,
  '$f8': 8, '$f9': 9, '$f10': 10, '$f11': 11, '$f12': 12, '$f13': 13, '$f14': 14, '$f15': 15,
  '$f16': 16, '$f17': 17, '$f18': 18, '$f19': 19, '$f20': 20, '$f21': 21, '$f22': 22, '$f23': 23,
  '$f24': 24, '$f25': 25, '$f26': 26, '$f27': 27, '$f28': 28, '$f29': 29, '$f30': 30, '$f31': 31
};

export class Assembler {
  private symbolTable: Map<string, number>;
  private equMap: Map<string, { expr: string, addr: number }>;
  private instructions: AssembledInstruction[];
  private dataSegment: AssembledData[];

  constructor() {
    this.symbolTable = new Map();
    this.equMap = new Map();
    this.instructions = [];
    this.dataSegment = [];
  }

  public compile(sourceCode: string) {
    this.symbolTable.clear();
    this.equMap.clear();
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
            expandedLines.push({ text: expandedText, lineNo });
          }
          break;
        }
      }

      if (!isMacroInvocation) expandedLines.push({ text: line, lineNo });
    });

    return expandedLines;
  }

  private passOne(lines: LineNode[]) {
    let currentSegment = '.text';
    let textAddress = TEXT_BASE;
    let dataAddress = DATA_BASE;
    let rdataAddress = RDATA_BASE;

    const getCurrAddress = () => currentSegment === '.text' ? textAddress : (currentSegment === '.rdata' ? rdataAddress : dataAddress);
    const advanceData = (size: number) => {
       if (currentSegment === '.rdata') rdataAddress += size;
       else dataAddress += size;
    };

    for (const node of lines) {
      let line = this.cleanLine(node.text);
      if (!line) continue;
      
      if (line === '.text' || line === '.data' || line === '.rdata') { 
        currentSegment = line; 
        continue; 
      }
      
      const equMatch = line.match(/^\.equ\s+([a-zA-Z_0-9]+)\s*,\s*(.+)$/) || line.match(/^([a-zA-Z_0-9]+)\s*=\s*(.+)$/);
      if (equMatch) {
        this.equMap.set(equMatch[1], { expr: equMatch[2], addr: getCurrAddress() });
        continue;
      }

      if (line.startsWith('.set') || line.startsWith('.global') || line.startsWith('.globl')) continue;

      const labelMatch = line.match(/^([a-zA-Z_0-9]+):(.*)$/);
      if (labelMatch) {
        this.symbolTable.set(labelMatch[1], getCurrAddress());
        line = labelMatch[2].trim();
        if (!line) continue;
      }

      if (currentSegment === '.text') {
        const opcode = line.split(/\s+/)[0].toLowerCase();
        if (opcode === 'la') textAddress += 8; 
        else if (['bgt', 'blt', 'bge', 'ble'].includes(opcode)) textAddress += 8; 
        else textAddress += 4;
      } else {
        const dAddr = getCurrAddress();
        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) advanceData(strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').length + 1);
        } else if (line.startsWith('.ascii ') && !line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.ascii\s+"(.*)"/);
          if (strMatch) advanceData(strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').length);
        } else if (line.startsWith('.byte')) {
          advanceData(line.substring(5).split(',').length);
        } else if (line.startsWith('.half')) {
          const padding = (2 - (dAddr % 2)) % 2;
          advanceData(padding + (line.substring(5).split(',').length * 2));
        } else if (line.startsWith('.word') || line.startsWith('.float')) {
          const padding = (4 - (dAddr % 4)) % 4;
          advanceData(padding + (line.substring(6).split(',').length * 4));
        } else if (line.startsWith('.space')) {
          advanceData(parseInt(line.substring(6).trim(), 10));
        } else if (line.startsWith('.align')) {
          const n = parseInt(line.substring(6).trim(), 10);
          const bound = Math.pow(2, n);
          advanceData((bound - (dAddr % bound)) % bound);
        }
      }
    }

    for (const [sym, data] of this.equMap.entries()) {
      let e = data.expr.replace(/(?<=^|[\s+\-*/()])\.(?=[\s+\-*/()]|$)/g, data.addr.toString());
      const sortedLabels = Array.from(this.symbolTable.keys()).sort((a,b) => b.length - a.length);
      for (const label of sortedLabels) {
        e = e.replace(new RegExp(`\\b${label}\\b`, 'g'), this.symbolTable.get(label)!.toString());
      }
      try {
        const val = new Function('return (' + e + ')')();
        this.symbolTable.set(sym, val);
      } catch (err) {
        throw new Error(`[Assembler Error] Failed to evaluate .equ expression: ${data.expr}`);
      }
    }
  }

  private passTwo(lines: LineNode[]) {
    let currentSegment = '.text';
    let textAddress = TEXT_BASE;
    let dataAddress = DATA_BASE;
    let rdataAddress = RDATA_BASE;

    const pushData = (bytes: Uint8Array, addr: number) => {
      this.dataSegment.push({ address: addr, data: bytes });
    };

    for (const node of lines) {
      const originalText = node.text;
      let line = this.cleanLine(originalText);
      
      if (!line) continue;
      if (line === '.text' || line === '.data' || line === '.rdata') {
        currentSegment = line; continue;
      }
      if (line.match(/^\.equ\s+/) || line.match(/^([a-zA-Z_0-9]+)\s*=/)) continue;

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
            originalLine: node.lineNo
          });
          textAddress += 4;
        }
      } else {
        let dAddr = currentSegment === '.rdata' ? rdataAddress : dataAddress;
        
        if (line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.asciiz\s+"(.*)"/);
          if (strMatch) {
            const str = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            const bytes = new Uint8Array(str.length + 1);
            for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
            pushData(bytes, dAddr);
            dAddr += bytes.length;
          }
        } else if (line.startsWith('.ascii ') && !line.startsWith('.asciiz')) {
          const strMatch = line.match(/\.ascii\s+"(.*)"/);
          if (strMatch) {
            const str = strMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
            pushData(bytes, dAddr);
            dAddr += bytes.length;
          }
        } else if (line.startsWith('.byte')) {
          const values = line.substring(5).split(',').map(v => this.parseImm(v.trim()));
          pushData(new Uint8Array(values), dAddr);
          dAddr += values.length;
        } else if (line.startsWith('.half')) {
          const padding = (2 - (dAddr % 2)) % 2;
          dAddr += padding;
          const values = line.substring(5).split(',').map(v => this.parseImm(v.trim()));
          const bytes = new Uint8Array(values.length * 2);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < values.length; i++) view.setUint16(i * 2, values[i] >>> 0, false);
          pushData(bytes, dAddr);
          dAddr += bytes.length;
        } else if (line.startsWith('.word')) {
          const padding = (4 - (dAddr % 4)) % 4;
          dAddr += padding;
          const values = line.substring(5).split(',').map(v => this.parseImm(v.trim()));
          const bytes = new Uint8Array(values.length * 4);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < values.length; i++) view.setUint32(i * 4, values[i] >>> 0, false);
          pushData(bytes, dAddr);
          dAddr += bytes.length;
        } else if (line.startsWith('.float')) {
          const padding = (4 - (dAddr % 4)) % 4;
          dAddr += padding;
          // PERBAIKAN: .float sekarang memvalidasi symbol table terlebih dahulu
          const values = line.substring(6).split(',').map(v => {
            const token = v.trim();
            return this.symbolTable.has(token) ? this.symbolTable.get(token)! : parseFloat(token);
          });
          const bytes = new Uint8Array(values.length * 4);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], false);
          pushData(bytes, dAddr);
          dAddr += bytes.length;
        } else if (line.startsWith('.space')) {
          const size = this.parseImm(line.substring(6).trim());
          pushData(new Uint8Array(size), dAddr);
          dAddr += size;
        } else if (line.startsWith('.align')) {
          const n = parseInt(line.substring(6).trim(), 10);
          const bound = Math.pow(2, n);
          dAddr += (bound - (dAddr % bound)) % bound;
        }

        if (currentSegment === '.rdata') rdataAddress = dAddr;
        else dataAddress = dAddr;
      }
    }
  }

  private parseImm(val: string): number {
    if (this.symbolTable.has(val)) return this.symbolTable.get(val)!;
    if (val.toLowerCase().startsWith('0x')) return parseInt(val, 16);
    return parseInt(val, 10);
  }

  private encodeInstruction(instruction: string, pc: number): number[] {
    const parts = instruction.replace(/,/g, ' ').trim().split(/\s+/);
    const opcode = parts[0].toLowerCase();
    const getReg = (regName: string) => REG_MAP[regName] || 0;

    const parseMemArg = (arg: string) => {
      const match = arg.match(/^(-?(?:0x[0-9a-fA-F]+|\d+|[a-zA-Z_0-9]+))\(([a-zA-Z0-9_$]+)\)$/);
      if (match) return { offset: this.parseImm(match[1]) & 0xFFFF, reg: getReg(match[2]) };
      return { offset: 0, reg: 0 };
    };

    switch (opcode) {
      case 'li': return [(9 << 26) | (0 << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[2]) & 0xFFFF)];
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
      case 'sll':   return [(0 << 26) | (0 << 21) | (getReg(parts[2]) << 16) | (getReg(parts[1]) << 11) | ((this.parseImm(parts[3]) & 0x1F) << 6) | 0x00];
      case 'srl':   return [(0 << 26) | (0 << 21) | (getReg(parts[2]) << 16) | (getReg(parts[1]) << 11) | ((this.parseImm(parts[3]) & 0x1F) << 6) | 0x02];
      case 'slt':   return [(0 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x2A];
      case 'mflo':  return [(0 << 26) | (0 << 21) | (0 << 16) | (getReg(parts[1]) << 11) | 0x12];
      case 'mfhi':  return [(0 << 26) | (0 << 21) | (0 << 16) | (getReg(parts[1]) << 11) | 0x10];
      case 'mul':   return [(28 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[3]) << 16) | (getReg(parts[1]) << 11) | 0x02];

      case 'addi':  return [(8 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];
      case 'addiu': return [(9 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];
      case 'andi':  return [(12 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];
      case 'ori':   return [(13 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];
      case 'xori':  return [(14 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];
      case 'lui':   return [(15 << 26) | (0 << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[2]) & 0xFFFF)];
      case 'slti':  return [(10 << 26) | (getReg(parts[2]) << 21) | (getReg(parts[1]) << 16) | (this.parseImm(parts[3]) & 0xFFFF)];

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

      case 'mfc1': return [(17 << 26) | (0 << 21) | (getReg(parts[1]) << 16) | (getReg(parts[2]) << 11) | 0x00];
      case 'mtc1': return [(17 << 26) | (4 << 21) | (getReg(parts[1]) << 16) | (getReg(parts[2]) << 11) | 0x00];
      case 'lwc1': {
        const memLw = parseMemArg(parts[2]);
        return [(49 << 26) | (memLw.reg << 21) | (getReg(parts[1]) << 16) | memLw.offset];
      }
      case 'swc1': {
        const memSw = parseMemArg(parts[2]);
        return [(57 << 26) | (memSw.reg << 21) | (getReg(parts[1]) << 16) | memSw.offset];
      }
      case 'add.s': return [(17 << 26) | (16 << 21) | (getReg(parts[3]) << 16) | (getReg(parts[2]) << 11) | (getReg(parts[1]) << 6) | 0x00];
      case 'sub.s': return [(17 << 26) | (16 << 21) | (getReg(parts[3]) << 16) | (getReg(parts[2]) << 11) | (getReg(parts[1]) << 6) | 0x01];
      case 'mul.s': return [(17 << 26) | (16 << 21) | (getReg(parts[3]) << 16) | (getReg(parts[2]) << 11) | (getReg(parts[1]) << 6) | 0x02];
      case 'div.s': return [(17 << 26) | (16 << 21) | (getReg(parts[3]) << 16) | (getReg(parts[2]) << 11) | (getReg(parts[1]) << 6) | 0x03];

      default: 
        console.warn(`[Assembler] Unrecognized instruction: ${instruction}`);
        return [0x00000000];
    }
  }

  private cleanLine(line: string): string {
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) line = line.substring(0, commentIndex);
    return line.trim();
  }
}