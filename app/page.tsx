"use client";

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic'; // BARU: Untuk Lazy Loading
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ResizableHandle, ResizablePanel, ResizablePanelGroup 
} from "@/components/ui/resizable";
import { 
  Play, StepForward, RotateCcw, Hammer, Pause, AlertTriangle,
  TerminalSquare, Cpu, Code2, Settings2, FileCode2, Database, ZoomIn, ZoomOut
} from "lucide-react";

import { Memory, TEXT_BASE, DATA_BASE } from '@/core/memory';
import { CPU, CPUStatus } from '@/core/cpu';
import { Assembler } from '@/core/assembler';

// BARU: Memuat Monaco Editor secara dinamis (Lazy Load) dengan Skeleton Placeholder
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#1e1e1e]">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
      <span className="text-xs text-zinc-500 font-mono">Loading Monaco Editor...</span>
    </div>
  )
});

const DEFAULT_CODE = `# ==============================================================================
# MIPS WEB EMULATOR - FEATURE SHOWCASE
# Menampilkan: .rdata (Protected), .equ (Konstanta), FPU Float, dan File I/O
# ==============================================================================

.macro print_str(%str_label)
    li $v0, 4
    la $a0, %str_label
    syscall
.end_macro

.rdata
    welcome: .asciiz "=== Penghitung Luas Lingkaran ===\\n"
    prompt:  .asciiz "Masukkan jari-jari (Float): "
    result:  .asciiz "Luas Lingkaran = "
    msg_io:  .asciiz "\\nMenyimpan ke file 'hasil.txt' (Cek LocalStorage)...\\n"
    fname:   .asciiz "hasil.txt"
    filemsg: .asciiz "Operasi MIPS Berhasil!"

.data
    .equ PI, 3.141592
    pi_val:  .float PI

.text
.globl main

main:
    print_str(welcome)
    print_str(prompt)

    # Membaca input Float (masuk ke $f0)
    li $v0, 6
    syscall

    mul.s $f2, $f0, $f0

    # Load konstanta PI
    la $t0, pi_val
    lwc1 $f1, 0($t0)

    mul.s $f12, $f1, $f2

    print_str(result)
    li $v0, 2
    syscall

    print_str(msg_io)
    
    # Syscall 13: Open File
    li $v0, 13
    la $a0, fname
    li $a1, 1       
    li $a2, 0       
    syscall
    move $s0, $v0   

    # Syscall 15: Write File
    li $v0, 15
    move $a0, $s0
    la $a1, filemsg
    li $a2, 22      
    syscall

    # Syscall 16: Close File
    li $v0, 16
    move $a0, $s0
    syscall

    li $v0, 10
    syscall
`;

const UI_GPR = [
  { id: 'pc', name: 'pc' }, { id: 'hi', name: 'hi' }, { id: 'lo', name: 'lo' },
  { id: '0', name: '$zero ($0)' }, { id: '1', name: '$at ($1)' },
  { id: '2', name: '$v0 ($2)' }, { id: '3', name: '$v1 ($3)' },
  { id: '4', name: '$a0 ($4)' }, { id: '5', name: '$a1 ($5)' }, { id: '6', name: '$a2 ($6)' }, { id: '7', name: '$a3 ($7)' },
  { id: '8', name: '$t0 ($8)' }, { id: '9', name: '$t1 ($9)' }, { id: '10', name: '$t2 ($10)' }, { id: '11', name: '$t3 ($11)' },
  { id: '12', name: '$t4 ($12)' }, { id: '13', name: '$t5 ($13)' }, { id: '14', name: '$t6 ($14)' }, { id: '15', name: '$t7 ($15)' },
  { id: '16', name: '$s0 ($16)' }, { id: '17', name: '$s1 ($17)' }, { id: '18', name: '$s2 ($18)' }, { id: '19', name: '$s3 ($19)' },
  { id: '20', name: '$s4 ($20)' }, { id: '21', name: '$s5 ($21)' }, { id: '22', name: '$s6 ($22)' }, { id: '23', name: '$s7 ($23)' },
  { id: '24', name: '$t8 ($24)' }, { id: '25', name: '$t9 ($25)' },
  { id: '26', name: '$k0 ($26)' }, { id: '27', name: '$k1 ($27)' },
  { id: '28', name: '$gp ($28)' }, { id: '29', name: '$sp ($29)' }, { id: '30', name: '$fp ($30)' }, { id: '31', name: '$ra ($31)' }
];

const UI_FPR = Array.from({ length: 32 }, (_, i) => ({ id: `f${i}`, name: `$f${i}` }));

export default function MipsEmulatorPage() {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompiled, setIsCompiled] = useState(false);
  const [isTerminalLoaded, setIsTerminalLoaded] = useState(false); // BARU: State UI Terminal
  
  const [regValues, setRegValues] = useState<Record<string, string>>({});
  const [disassembly, setDisassembly] = useState<any[]>([]);
  const [memoryDump, setMemoryDump] = useState<any[]>([]);
  
  const [activePC, setActivePC] = useState<number>(0);
  const [memorySearchInput, setMemorySearchInput] = useState<string>("00000000");
  
  const [viewFontSize, setViewFontSize] = useState<number>(12);
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
      setIsTerminalLoaded(true); // Terminal selesai dimuat, hapus skeleton

      cpuInstance.current.onPrint = (text: string) => term.write(text.replace(/\n/g, '\r\n'));
      cpuInstance.current.onExit = (exitCode: number) => {
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
        setIsRunning(false);
        syncUI();
      };

      cpuInstance.current.onInputRequired = (type) => {
        let inputBuffer = '';
        term.write(type === 'float' ? '\x1b[36m' : '\x1b[33m'); 
        inputDisposable.current = term.onData((data: string) => {
          const code = data.charCodeAt(0);
          if (code === 13) { 
            term.write('\x1b[0m\r\n'); 
            const val = type === 'float' ? (parseFloat(inputBuffer) || 0) : (parseInt(inputBuffer, 10) || 0);
            inputDisposable.current?.dispose(); 
            cpuInstance.current.provideInput(val, type);
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
      options: { isWholeLine: false, glyphMarginClassName: 'breakpoint-glyph' }
    }));
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
  }, [editorBreakpoints]);

  const toggleBreakpoint = (address: number) => {
    setAddressBreakpoints(prev => {
      const newBps = new Set(prev);
      if (newBps.has(address)) newBps.delete(address);
      else newBps.add(address);
      return newBps;
    });
  };

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
      newRegs[i.toString()] = (cpu.registers[i] >>> 0).toString(16).padStart(8, '0');
    }
    for (let i = 0; i < 32; i++) {
      newRegs[`f${i}`] = cpu.fRegisters[i].toFixed(4); 
    }
    setRegValues(newRegs);
  };

  const generateMemoryDump = (startAddressHex: string) => {
    const mem = memoryInstance.current;
    const dump = [];
    let startAddr = parseInt(startAddressHex, 16);
    if (isNaN(startAddr)) startAddr = DATA_BASE; 

    for (let i = 0; i < 16; i++) {
      const addr = startAddr + (i * 16);
      const words = [];
      let ascii = '';

      for (let w = 0; w < 4; w++) {
        let wordVal = 0;
        try { wordVal = mem.read32(addr + (w * 4)); } catch (e) { wordVal = 0; }

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
        memoryInstance.current.load32(inst.address, inst.machineCode);
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
          memoryInstance.current.load8(data.address + i, data.data[i]);
        }
      }
      
      generateMemoryDump(memorySearchInput);
      syncUI();
      setIsCompiled(true);
      xtermInstance.current.writeln('\x1b[32m[Success]\x1b[0m Binary compiled successfully.');
      return true;

    } catch (err: any) {
      setDisassembly([]);
      setMemoryDump([]);
      setAddressBreakpoints(new Set());
      setIsCompiled(false);
      memoryInstance.current.reset(); 
      cpuInstance.current.reset();
      syncUI();

      xtermInstance.current.writeln(`\x1b[31;1m[Assembler Error] ${err.message}\x1b[0m`);
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

      if (status === 'RUNNING') requestAnimationFrame(executeCycle);
      else if (status === 'HALTED') {
         setIsRunning(false);
         syncUI(); 
      }
    } catch (err: any) {
      setIsRunning(false);
      xtermInstance.current.writeln(`\r\n\x1b[31;1m[CPU Exception] ${err.message}\x1b[0m`);
      syncUI();
    }
  };

  const handleRun = () => {
    if (isRunning) return;
    if (!isCompiled) {
      const isSuccess = handleBuild();
      if (!isSuccess) return; 
    }

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
    if (!isCompiled) {
      const isSuccess = handleBuild();
      if (!isSuccess) return;
    }
    try {
      isResumingRef.current = true; 
      cpuInstance.current.step();
      syncUI();
    } catch (err: any) {
      xtermInstance.current?.writeln(`\x1b[31;1m[Exception] ${err.message}\x1b[0m`);
    }
  };

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
    
    let deletedFiles = 0;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('mips_fs_')) {
        localStorage.removeItem(key);
        deletedFiles++;
      }
    });

    xtermInstance.current?.writeln('\x1b[32m[System]\x1b[0m MIPS32 OS Ready (Total Reset).');
    if (deletedFiles > 0) {
      xtermInstance.current?.writeln(`\x1b[36m$ Cleaned up ${deletedFiles} virtual file(s) from LocalStorage.\x1b[0m`);
    }
  };

  return (
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
            <p className="text-[10px] text-zinc-500 font-mono">v1.0.0-release</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/80">
            <span className="text-[10px] uppercase text-zinc-600 font-bold px-2">System:</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" onClick={handleResetCPU} title="Reset PC & Registers">Reset CPU</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" onClick={handleResetMemory} title="Clear Data & RAM">Clear RAM</Button>
            <div className="w-px h-4 bg-zinc-700 mx-1"></div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={handleResetAll} title="Hard Reset System & Disk">
               <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Hard Reset
            </Button>
          </div>

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
        {/* @ts-ignore: Mengabaikan strict typing error bawaan library untuk properti direction */}
        <ResizablePanelGroup direction="horizontal">
          
          <ResizablePanel defaultSize={20} minSize={15} className="bg-zinc-950/80">
            <div className="h-full flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
                <Settings2 className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-semibold uppercase tracking-wider">Registers</span>
              </div>
              <ScrollArea className="flex-1 p-2 space-y-0.5">
                <div className="sticky top-0 bg-zinc-950/90 backdrop-blur z-10 py-1 border-b border-zinc-800/50 mb-1">
                   <span className="text-[10px] font-bold text-zinc-500 px-2 uppercase tracking-widest">Integer (GPR)</span>
                </div>
                {UI_GPR.map((reg) => (
                  <div key={reg.id} className="flex justify-between items-center py-1.5 px-2 hover:bg-zinc-800/80 group rounded transition-colors cursor-default">
                    <span className="font-mono text-[11px] text-zinc-400 group-hover:text-zinc-200">{reg.name}</span>
                    <span className="font-mono text-[11px] text-emerald-400/80 group-hover:text-emerald-400">
                      {regValues[reg.id] || '00000000'}
                    </span>
                  </div>
                ))}

                <div className="sticky top-0 bg-zinc-950/90 backdrop-blur z-10 py-1 border-b border-zinc-800/50 mt-4 mb-1">
                   <span className="text-[10px] font-bold text-zinc-500 px-2 uppercase tracking-widest">Float (FPU)</span>
                </div>
                {UI_FPR.map((reg) => (
                  <div key={reg.id} className="flex justify-between items-center py-1.5 px-2 hover:bg-zinc-800/80 group rounded transition-colors cursor-default">
                    <span className="font-mono text-[11px] text-zinc-400 group-hover:text-zinc-200">{reg.name}</span>
                    <span className="font-mono text-[11px] text-cyan-400/80 group-hover:text-cyan-400">
                      {regValues[reg.id] || '0.0000'}
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-zinc-800 hover:bg-emerald-500/50" />

          <ResizablePanel defaultSize={50} minSize={30} className="bg-zinc-950 flex flex-col min-w-0">
            <Tabs defaultValue="code" className="flex-1 flex flex-col h-full">
              <div className="bg-zinc-900 border-b border-zinc-800 px-2 pt-1.5 flex items-end">
                <TabsList className="bg-transparent border-none p-0 h-8 flex gap-1.5">
                  <TabsTrigger value="code" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <Code2 className="w-3.5 h-3.5 mr-2" /> Code
                  </TabsTrigger>
                  <TabsTrigger value="disassembly" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly
                  </TabsTrigger>
                  <TabsTrigger value="memory" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white data-[state=active]:border-zinc-700 data-[state=active]:border-b-zinc-950 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400 text-xs px-4 transition-colors">
                    <Database className="w-3.5 h-3.5 mr-2" /> Memory
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="code" className="flex-1 m-0 h-full p-0 border-none outline-none relative">
                <MonacoEditor 
                  height="100%" 
                  language="mips" 
                  theme="vs-dark" 
                  value={code} 
                  onChange={(val) => {
                    setCode(val || "");
                    setIsCompiled(false); 
                  }} 
                  onMount={handleEditorDidMount} 
                  options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "'Geist Mono', monospace", padding: { top: 16 }, glyphMargin: true }} 
                />
              </TabsContent>
              
              <TabsContent value="disassembly" className="flex-1 m-0 flex flex-col bg-zinc-950 overflow-hidden outline-none data-[state=active]:flex">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
                  <span className="text-xs text-zinc-400">Click a line to set a Breakpoint.</span>
                  <div className="flex items-center gap-1">
                     <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setViewFontSize(Math.max(10, viewFontSize - 1))}><ZoomOut className="w-3.5 h-3.5"/></Button>
                     <span className="text-[10px] text-zinc-500 font-mono w-6 text-center">{viewFontSize}px</span>
                     <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setViewFontSize(Math.min(24, viewFontSize + 1))}><ZoomIn className="w-3.5 h-3.5"/></Button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 border-b border-zinc-800">
                      <tr>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-32">Address</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-28 border-l border-zinc-800">Opcode</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border-l border-zinc-800">Disassembly</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono" style={{ fontSize: `${viewFontSize}px` }}>
                      {disassembly.length === 0 ? (
                         <tr><td colSpan={3} className="p-4 text-center text-zinc-600 italic text-xs">Compile code to view disassembly</td></tr>
                      ) : (
                        disassembly.map((row, idx) => {
                          const isActive = row.address === activePC;
                          const isBp = addressBreakpoints.has(row.address);
                          return (
                            <tr key={idx} onClick={() => toggleBreakpoint(row.address)} className={`${isActive ? 'bg-yellow-500/20 text-yellow-300' : 'hover:bg-zinc-800/30 text-zinc-400'} border-b border-zinc-900/50 cursor-pointer`}>
                              <td className="px-3 py-1.5 flex items-center">
                                <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${isBp ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-transparent'}`}></div>
                                {row.addressHex}
                              </td>
                              <td className="px-3 py-1.5 text-zinc-500 border-l border-zinc-900/50">{row.opcode}</td>
                              <td className="px-3 py-1.5 border-l border-zinc-900/50 whitespace-pre">{row.instruction}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="memory" className="flex-1 m-0 flex flex-col bg-zinc-950 overflow-hidden outline-none data-[state=active]:flex">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Go to Hex address: 0x</span>
                    <input type="text" value={memorySearchInput} onChange={(e) => setMemorySearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && generateMemoryDump(memorySearchInput)} className="h-7 w-24 bg-zinc-950 border border-zinc-700 rounded px-2 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-500" placeholder="10010000" />
                    <Button variant="secondary" size="sm" className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300" onClick={() => generateMemoryDump(memorySearchInput)}>Refresh</Button>
                  </div>
                  <div className="flex items-center gap-1">
                     <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setViewFontSize(Math.max(10, viewFontSize - 1))}><ZoomOut className="w-3.5 h-3.5"/></Button>
                     <span className="text-[10px] text-zinc-500 font-mono w-6 text-center">{viewFontSize}px</span>
                     <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setViewFontSize(Math.min(24, viewFontSize + 1))}><ZoomIn className="w-3.5 h-3.5"/></Button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto relative">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 border-b border-zinc-800">
                      <tr>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 w-28">Address</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-zinc-300 border-l border-zinc-800">Memory contents and ASCII</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono" style={{ fontSize: `${viewFontSize}px` }}>
                      {memoryDump.length === 0 ? (
                         <tr><td colSpan={2} className="p-4 text-center text-zinc-600 italic text-xs">Compile code to view memory</td></tr>
                      ) : (
                        memoryDump.map((row, idx) => (
                          <tr key={idx} className="border-b border-zinc-900/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-1.5 font-semibold text-zinc-400">{row.address}</td>
                            <td className="px-3 py-1.5 border-l border-zinc-900/50 flex gap-4 items-center">
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
            <div className="h-full flex flex-col relative">
              {/* BARU: Skeleton Loader untuk Terminal */}
              {!isTerminalLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
                  <span className="text-xs text-zinc-500 font-mono animate-pulse">Initializing Terminal...</span>
                </div>
              )}
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