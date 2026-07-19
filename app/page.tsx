"use client";

import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ResizableHandle, ResizablePanel, ResizablePanelGroup 
} from "@/components/ui/resizable";
import { 
  Play, StepForward, RotateCcw, Hammer, Pause, AlertTriangle, Delete,
  TerminalSquare, Cpu, Code2, Settings2, FileCode2, Database
} from "lucide-react";

import { Memory, TEXT_BASE, DATA_BASE } from '@/core/memory';
import { CPU, CPUStatus } from '@/core/cpu';
import { Assembler } from '@/core/assembler';

const DEFAULT_CODE = `# ==============================================================================
# MIPS COMPILER TESTER (With .equ and .rdata Support)
# ==============================================================================

.macro print_str(%str_label)
    li $v0, 4
    la $a0, %str_label
    syscall
.end_macro

.macro exit_program()
    li $v0, 10
    syscall
.end_macro

# --- Read-Only Data ---
.rdata
    readonly_msg: .asciiz "[Memasuki Area .rdata] Emulator Aman!\\n"

# --- Data Segment & Constants ---
.data
    array:      .word 10, 20, 30, 40
    
    # MENGHITUNG UKURAN ARRAY DENGAN .equ DAN TITIK (.)
    .equ ARRAY_SIZE_BYTES, . - array
    .equ ARRAY_LENGTH, 4

.text
.globl main

main:
    # Uji coba cetak dari .rdata
    print_str(readonly_msg)

    # Uji coba konstanta (ARRAY_LENGTH bernilai 4)
    li $t0, ARRAY_LENGTH
    
    exit_program()`;

const UI_REGISTERS = [
  { id: 'pc', name: 'pc' }, { id: 'hi', name: 'hi' }, { id: 'lo', name: 'lo' },
  { id: 0, name: '$zero ($0)' }, { id: 1, name: '$at ($1)' },
  { id: 2, name: '$v0 ($2)' }, { id: 3, name: '$v1 ($3)' },
  { id: 4, name: '$a0 ($4)' }, { id: 5, name: '$a1 ($5)' }, { id: 6, name: '$a2 ($6)' }, { id: 7, name: '$a3 ($7)' },
  { id: 8, name: '$t0 ($8)' }, { id: 9, name: '$t1 ($9)' }, { id: 10, name: '$t2 ($10)' }, { id: 11, name: '$t3 ($11)' },
  { id: 12, name: '$t4 ($12)' }, { id: 13, name: '$t5 ($13)' }, { id: 14, name: '$t6 ($14)' }, { id: 15, name: '$t7 ($15)' },
  { id: 16, name: '$s0 ($16)' }, { id: 17, name: '$s1 ($17)' }, { id: 18, name: '$s2 ($18)' }, { id: 19, name: '$s3 ($19)' },
  { id: 20, name: '$s4 ($20)' }, { id: 21, name: '$s5 ($21)' }, { id: 22, name: '$s6 ($22)' }, { id: 23, name: '$s7 ($23)' },
  { id: 24, name: '$t8 ($24)' }, { id: 25, name: '$t9 ($25)' },
  { id: 26, name: '$k0 ($26)' }, { id: 27, name: '$k1 ($27)' },
  { id: 28, name: '$gp ($28)' }, { id: 29, name: '$sp ($29)' }, { id: 30, name: '$fp ($30)' }, { id: 31, name: '$ra ($31)' }
];

export default function MipsEmulatorPage() {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompiled, setIsCompiled] = useState(false);
  
  const [regValues, setRegValues] = useState<Record<string, string>>({});
  const [disassembly, setDisassembly] = useState<any[]>([]);
  const [memoryDump, setMemoryDump] = useState<any[]>([]);
  
  const [activePC, setActivePC] = useState<number>(0);
  const [memorySearchInput, setMemorySearchInput] = useState<string>("00000000");
  const [isWaitingInput, setIsWaitingInput] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const [editorBreakpoints, setEditorBreakpoints] = useState<Set<number>>(new Set());
  const [addressBreakpoints, setAddressBreakpoints] = useState<Set<number>>(new Set());

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<any>(null);
  const isResumingRef = useRef(false);
  const inputDisposable = useRef<any>(null);
  
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const monacoRef = useRef<any>(null);

  const memoryInstance = useRef(new Memory());
  const cpuInstance = useRef(new CPU(memoryInstance.current));
  const assemblerInstance = useRef(new Assembler());

  useEffect(() => {
    let fitAddon: any;
    const initTerminal = async () => {
      if (!terminalRef.current) return;
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#10b981' },
        fontFamily: "'Geist Mono', monospace", fontSize: 13, cursorBlink: true,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      term.writeln('\x1b[32m[System]\x1b[0m MIPS32 OS Ready.');
      xtermInstance.current = term;

      cpuInstance.current.onPrint = (text: string) => term.write(text.replace(/\n/g, '\r\n'));
      cpuInstance.current.onExit = (exitCode: number) => {
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
        setIsRunning(false);
        syncUI();
      };

      cpuInstance.current.onInputRequired = () => {
        let inputBuffer = '';
        term.write('\x1b[33m'); 
        inputDisposable.current = term.onData((data: string) => {
          const code = data.charCodeAt(0);
          if (code === 13) { 
            term.write('\x1b[0m\r\n'); 
            const val = parseInt(inputBuffer, 10) || 0;
            inputDisposable.current?.dispose(); 
            cpuInstance.current.provideInput(val);
            requestAnimationFrame(executeCycle); 
          } else if (code === 127 || code === 8) { 
            if (inputBuffer.length > 0) {
              inputBuffer = inputBuffer.slice(0, -1);
              term.write('\b \b');
            }
          } else if (code >= 32 && code <= 126) { 
            inputBuffer += data;
            term.write(data);
          }
        });
      };

      const resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(terminalRef.current);
      return () => resizeObserver.disconnect();
    };

    initTerminal();
    syncUI();
  }, []);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const newDecorations = Array.from(editorBreakpoints).map(line => ({
      range: new monacoRef.current.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'breakpoint-glyph'
      }
    }));
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  }, [editorBreakpoints]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNo = e.target.position.lineNumber;
        setEditorBreakpoints(prev => {
          const nw = new Set(prev);
          if (nw.has(lineNo)) nw.delete(lineNo); else nw.add(lineNo);
          return nw;
        });
      }
    });
  };

  const syncUI = () => {
    const cpu = cpuInstance.current;
    setActivePC(cpu.pc);

    const newRegs: Record<string, string> = {
      'pc': cpu.pc.toString(16).padStart(8, '0'),
      'hi': (cpu.hi >>> 0).toString(16).padStart(8, '0'),
      'lo': (cpu.lo >>> 0).toString(16).padStart(8, '0')
    };
    for (let i = 0; i < 32; i++) {
      newRegs[i] = (cpu.registers[i] >>> 0).toString(16).padStart(8, '0');
    }
    setRegValues(newRegs);
  };

  const generateMemoryDump = (startAddressHex: string) => {
    const mem = memoryInstance.current;
    const dump = [];
    let startAddr = parseInt(startAddressHex, 16);
    if (isNaN(startAddr)) startAddr = DATA_BASE; 

    const mockElfHeader = [
      0x7F454C46, 0x01020100, 0x00000000, 0x00000000,
      0x00020008, 0x00000001, 0x00400000, 0x00000034,
      0x00000000, 0x00000000, 0x00340020, 0x00010028
    ];

    for (let i = 0; i < 16; i++) {
      const addr = startAddr + (i * 16);
      const words = [];
      let ascii = '';

      for (let w = 0; w < 4; w++) {
        let wordVal = 0;
        if (addr + (w * 4) < mockElfHeader.length * 4 && startAddr < 0x00400000) {
           wordVal = mockElfHeader[(addr + (w * 4)) / 4];
        } else {
           try { wordVal = mem.read32(addr + (w * 4)); } catch (e) { wordVal = 0; }
        }

        words.push(wordVal.toString(16).padStart(8, '0'));
        for (let b = 0; b < 4; b++) {
          const byte = (wordVal >>> (24 - b * 8)) & 0xFF;
          if (byte >= 32 && byte <= 126) ascii += String.fromCharCode(byte);
          else ascii += '.'; 
        }
      }
      dump.push({ address: addr.toString(16).padStart(8, '0'), words, ascii });
    }
    setMemoryDump(dump);
  };

  const handleBuild = () => {
    if (!xtermInstance.current) return false;
    if (inputDisposable.current) inputDisposable.current.dispose();
    setIsRunning(false);
    
    xtermInstance.current.writeln('\x1b[36m$ compiling...\x1b[0m');
    memoryInstance.current.reset();
    cpuInstance.current.reset();

    try {
      const compiled = assemblerInstance.current.compile(code);
      const newDisasm = [];
      const newAddressBps = new Set<number>();
      
      for (const inst of compiled.instructions) {
        memoryInstance.current.write32(inst.address, inst.machineCode);
        newDisasm.push({
          address: inst.address,
          addressHex: inst.address.toString(16).padStart(8, '0'),
          opcode: inst.hexString,
          instruction: inst.originalText
        });
        if (editorBreakpoints.has(inst.originalLine)) {
          newAddressBps.add(inst.address);
        }
      }
      setDisassembly(newDisasm);
      setAddressBreakpoints(newAddressBps);

      for (const data of compiled.data) {
        for (let i = 0; i < data.data.length; i++) {
          memoryInstance.current.write8(data.address + i, data.data[i]);
        }
      }
      
      generateMemoryDump(memorySearchInput);
      syncUI();
      setIsCompiled(true);
      xtermInstance.current.writeln('\x1b[32m[Success]\x1b[0m Binary compiled as MIPS ELF object.');
      return true;
    } catch (err: any) {
      xtermInstance.current.writeln(`\x1b[31m[Assembler Error] ${err.message}\x1b[0m`);
      return false;
    }
  };

  const executeCycle = () => {
    try {
      let status: CPUStatus = 'RUNNING';
      for (let i = 0; i < 500; i++) {
        const currPc = cpuInstance.current.pc;
        
        if (addressBreakpoints.has(currPc) && !isResumingRef.current) {
          setIsRunning(false);
          syncUI();
          xtermInstance.current.writeln(`\x1b[93m[Paused] Breakpoint hit at 0x${currPc.toString(16).padStart(8,'0')}\x1b[0m`);
          return;
        }
        isResumingRef.current = false;

        status = cpuInstance.current.step();
        if (status !== 'RUNNING') break;
      }

      if (status === 'RUNNING') {
         requestAnimationFrame(executeCycle);
      } else if (status === 'HALTED') {
         setIsRunning(false);
         syncUI(); 
      }
    } catch (err: any) {
      setIsRunning(false);
      xtermInstance.current.writeln(`\r\n\x1b[31m[CPU Exception] ${err.message}\x1b[0m`);
      syncUI();
    }
  };

  const handleRun = () => {
    if (isRunning) return;
    if (!isCompiled && !handleBuild()) return;

    setIsRunning(true);
    isResumingRef.current = true; 
    requestAnimationFrame(executeCycle);
  };

  const handlePause = () => {
    setIsRunning(false);
    syncUI();
    xtermInstance.current.writeln('\x1b[93m[Paused] Execution halted by user.\x1b[0m');
  };

  const handleStep = () => {
    if (!isCompiled && !handleBuild()) return;
    try {
      isResumingRef.current = true; 
      cpuInstance.current.step();
      syncUI();
    } catch (err: any) {
      xtermInstance.current?.writeln(`\x1b[31m[Exception] ${err.message}\x1b[0m`);
    }
  };

  // --- FUNGSI RESET SYSTEM YANG JELAS ---
  const handleResetCPU = () => {
    cpuInstance.current.reset();
    isResumingRef.current = false;
    setIsRunning(false);
    syncUI();
    xtermInstance.current?.writeln('\x1b[36m$ CPU registers and PC have been reset.\x1b[0m');
  };

  const handleResetMemory = () => {
    memoryInstance.current.resetDataOnly();
    generateMemoryDump(memorySearchInput);
    xtermInstance.current?.writeln('\x1b[36m$ Data and Stack memory cleared.\x1b[0m');
  };

  const handleResetAll = () => {
    setIsCompiled(false);
    setIsRunning(false);
    if (inputDisposable.current) inputDisposable.current.dispose();
    memoryInstance.current.reset();
    cpuInstance.current.reset();
    setDisassembly([]);
    setMemoryDump([]);
    syncUI();
    xtermInstance.current?.clear();
    xtermInstance.current?.writeln('\x1b[32m[System]\x1b[0m MIPS32 OS Ready (Total Reset).');
  };

  return (
    // Membatasi min-w-[960px] untuk memastikan tampilan tidak rusak di perangkat yang terlalu kecil, namun pas di Tablet.
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-300 font-sans min-w-[960px] overflow-x-auto overflow-y-hidden">
      <style>{`
        .breakpoint-glyph { background-color: #ef4444; border-radius: 50%; width: 10px !important; height: 10px !important; margin-left: 5px; margin-top: 5px; cursor: pointer; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
      `}</style>

      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950 z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-900 border border-zinc-800">
            <Cpu className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">MIPS Web Emulator</h1>
            <p className="text-[10px] text-zinc-500 font-mono">v1.0.0-beta</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* RESET SYSTEM UX yang lebih rapi */}
          <div className="flex items-center bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/80">
            <span className="text-[10px] uppercase text-zinc-600 font-bold px-2">System:</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" onClick={handleResetCPU} title="Reset PC & Registers">
               Reset CPU
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" onClick={handleResetMemory} title="Clear Data & RAM">
               Clear RAM
            </Button>
            <div className="w-px h-4 bg-zinc-700 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={handleResetAll} title="Hard Reset System">
               <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Hard Reset
            </Button>
          </div>

          {/* EKSEKUSI CONTROLS */}
          <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/80">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-zinc-300 hover:text-white" onClick={handleBuild} disabled={isRunning}>
              <Hammer className="w-3.5 h-3.5" /> Build
            </Button>
            <div className="w-px h-4 bg-zinc-700 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-zinc-300 hover:text-white" onClick={handleStep} disabled={isRunning}>
              <StepForward className="w-3.5 h-3.5" /> Step
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10" onClick={handlePause} disabled={!isRunning}>
              <Pause className="w-3.5 h-3.5 fill-current" /> Pause
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white ml-1" onClick={handleRun} disabled={isRunning}>
              <Play className="w-3.5 h-3.5 fill-current" /> Run
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          
          <ResizablePanel defaultSize={20} minSize={15} className="bg-zinc-950/80">
            <div className="h-full flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
                <Settings2 className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Registers</span>
              </div>
              <ScrollArea className="flex-1 p-2 space-y-0.5">
                {UI_REGISTERS.map((reg) => (
                  <div key={reg.id} className="flex justify-between items-center py-1.5 px-2 hover:bg-zinc-800/80 group rounded transition-colors cursor-default">
                    <span className="font-mono text-[11px] text-zinc-400 group-hover:text-zinc-200">{reg.name}</span>
                    <span className="font-mono text-[11px] text-emerald-400/80 group-hover:text-emerald-400">
                      {regValues[reg.id] || '00000000'}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50" />

          <ResizablePanel defaultSize={50} minSize={30} className="bg-zinc-950 flex flex-col min-w-0">
            <Tabs defaultValue="main.s" className="flex-1 flex flex-col h-full">
              <div className="bg-zinc-900 border-b border-zinc-800 px-2 pt-1.5 flex items-end">
                <TabsList className="bg-transparent border-none p-0 h-8 flex gap-1.5">
                  <TabsTrigger value="main.s" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <Code2 className="w-3.5 h-3.5 mr-2" /> main.s
                  </TabsTrigger>
                  <TabsTrigger value="disassembly" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly
                  </TabsTrigger>
                  <TabsTrigger value="memory" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <Database className="w-3.5 h-3.5 mr-2" /> Memory
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="main.s" className="flex-1 m-0 h-full p-0 border-none outline-none">
                <Editor height="100%" language="mips" theme="vs-dark" value={code} onChange={(val) => setCode(val || "")} onMount={handleEditorDidMount} options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "'Geist Mono', monospace", padding: { top: 16 }, glyphMargin: true }} />
              </TabsContent>
              
              <TabsContent value="disassembly" className="flex-1 m-0 flex flex-col bg-zinc-950 overflow-hidden outline-none data-[state=active]:flex">
                <div className="flex-1 overflow-auto relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 border-b border-zinc-800">
                      <tr>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-32">Address</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-28 border-l border-zinc-800">Opcode</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border-l border-zinc-800">Disassembly</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {disassembly.length === 0 ? (
                         <tr><td colSpan={3} className="p-4 text-center text-zinc-600 italic">Compile code to view disassembly</td></tr>
                      ) : (
                        disassembly.map((row, idx) => {
                          const isActive = row.address === activePC;
                          const isBp = addressBreakpoints.has(row.address);
                          return (
                            <tr key={idx} onClick={() => toggleBreakpoint(row.address)} className={`${isActive ? 'bg-yellow-500/20 text-yellow-300' : 'hover:bg-zinc-800/30 text-zinc-400'} border-b border-zinc-900/50 cursor-pointer`}>
                              <td className="px-3 py-1 flex items-center">
                                <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${isBp ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-transparent'}`}></div>
                                {row.addressHex}
                              </td>
                              <td className="px-3 py-1 text-zinc-500 border-l border-zinc-900/50">{row.opcode}</td>
                              <td className="px-3 py-1 border-l border-zinc-900/50 whitespace-pre">{row.instruction}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="memory" className="flex-1 m-0 flex flex-col bg-zinc-950 overflow-hidden outline-none data-[state=active]:flex">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
                  <span className="text-xs text-zinc-400">Go to Hex address: 0x</span>
                  <input type="text" value={memorySearchInput} onChange={(e) => setMemorySearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && generateMemoryDump(memorySearchInput)} className="h-7 w-24 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-500" placeholder="10010000" />
                  <Button variant="secondary" size="sm" className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300" onClick={() => generateMemoryDump(memorySearchInput)}>Refresh</Button>
                </div>
                <div className="flex-1 overflow-auto relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 border-b border-zinc-800">
                      <tr>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-28">Address</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border-l border-zinc-800">Memory contents and ASCII</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px] text-zinc-400">
                      {memoryDump.length === 0 ? (
                         <tr><td colSpan={2} className="p-4 text-center text-zinc-600 italic">Compile code to view memory</td></tr>
                      ) : (
                        memoryDump.map((row, idx) => (
                          <tr key={idx} className="border-b border-zinc-900/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-1 font-semibold">{row.address}</td>
                            <td className="px-3 py-1 border-l border-zinc-900/50 flex gap-4 items-center">
                              <span className="text-zinc-300 tracking-widest min-w-[280px]">
                                {row.words.map((w: string, i: number) => <span key={i} className={w === '00000000' ? 'text-zinc-600' : 'text-zinc-200'}>{w}{i < 3 ? '  ' : ''}</span>)}
                              </span>
                              <span className="font-bold tracking-widest">
                                {row.ascii.split('').map((char: string, i: number) => <span key={i} className={char === '.' ? 'text-red-500/80' : 'text-zinc-300'}>{char}</span>)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50" />

          <ResizablePanel defaultSize={30} minSize={20} className="bg-[#09090b]">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
                <div className="flex items-center gap-2 text-zinc-400">
                  <TerminalSquare className="w-4 h-4" />
                  <span className="text-xs uppercase font-semibold tracking-wider">Terminal</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-sm" onClick={() => xtermInstance.current?.clear()}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex-1 p-2 relative" ref={terminalRef}></div>
            </div>
          </ResizablePanel>
          
        </ResizablePanelGroup>
      </div>
    </div>
  );
}