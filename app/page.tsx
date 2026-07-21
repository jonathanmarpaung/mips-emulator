"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Play, StepForward, RotateCcw, Hammer, Pause, AlertTriangle,
  Cpu, Code2, Settings2, FileCode2, Database, Menu, TerminalSquare
} from "lucide-react";

import { Memory, DATA_BASE, TEXT_BASE } from '@/core/memory';
import { CPU, CPUStatus } from '@/core/cpu';
import { Assembler } from '@/core/assembler';

// Import Components
import { Sidebar } from '@/components/emulator/Sidebar';
import { EditorView } from '@/components/emulator/EditorView';
import { DisassemblyView } from '@/components/emulator/DisassemblyView';
import { MemoryView } from '@/components/emulator/MemoryView';
import { TerminalView } from '@/components/emulator/TerminalView';

const DEFAULT_CODE = `# ==============================================================================
# MIPS WEB EMULATOR
# Contoh: Entry Point & Hello World
# ==============================================================================

.data
    hello: .asciiz "Hello, World!\\n"

.text
.globl main

# ------------------------------------------------------------------------------
# Fungsi ini sengaja diletakkan di atas 'main'. 
# Jika OS Loader bekerja, fungsi ini akan dilewati dan CPU langsung ke 'main'.
# ------------------------------------------------------------------------------
fungsi_dummy:
    li $v0, 10
    syscall

# ------------------------------------------------------------------------------
# ENTRY POINT UTAMA
# ------------------------------------------------------------------------------
main:
    # Cetak string
    li $v0, 4
    la $a0, hello
    syscall

    # Keluar dari program
    li $v0, 10
    syscall
`;

export default function MipsEmulatorPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Single Source of Truth untuk Tab Navigation
  const [activeTab, setActiveTab] = useState<string>('code');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'registers'>('files');
  
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompiled, setIsCompiled] = useState(false);
  
  const [regValues, setRegValues] = useState<Record<string, string>>({});
  const [disassembly, setDisassembly] = useState<any[]>([]);
  const [memoryDump, setMemoryDump] = useState<any[]>([]);
  const [memoryAddress, setMemoryAddress] = useState<number>(DATA_BASE);
  const [memorySearchInput, setMemorySearchInput] = useState<string>(DATA_BASE.toString(16).padStart(8, '0'));
  
  const [activePC, setActivePC] = useState<number>(0);
  const [viewFontSize, setViewFontSize] = useState<number>(13);
  const [editorBreakpoints, setEditorBreakpoints] = useState<Set<number>>(new Set());
  const [addressBreakpoints, setAddressBreakpoints] = useState<Set<number>>(new Set());

  const memoryInstance = useRef(new Memory());
  const cpuInstance = useRef(new CPU(memoryInstance.current));
  const assemblerInstance = useRef(new Assembler());
  const isResumingRef = useRef(false);
  
  const entryPointRef = useRef<number>(TEXT_BASE);

  useEffect(() => {
    setIsMounted(true);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    syncUI();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const syncUI = () => {
    const cpu = cpuInstance.current;
    setActivePC(cpu.pc);
    const newRegs: Record<string, string> = {
      'pc': cpu.pc.toString(16).padStart(8, '0'),
      'hi': (cpu.hi >>> 0).toString(16).padStart(8, '0'),
      'lo': (cpu.lo >>> 0).toString(16).padStart(8, '0')
    };
    for (let i = 0; i < 32; i++) newRegs[i.toString()] = (cpu.registers[i] >>> 0).toString(16).padStart(8, '0');
    for (let i = 0; i < 32; i++) newRegs[`f${i}`] = cpu.fRegisters[i].toFixed(4); 
    setRegValues(newRegs);
  };

  const generateMemoryDump = (startAddr: number) => {
    const mem = memoryInstance.current;
    const dump = [];
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

  const handlePageMemory = (offset: number) => {
    const newAddr = Math.max(0, Math.min(0xFFFFFF00, memoryAddress + offset));
    setMemoryAddress(newAddr);
    setMemorySearchInput(newAddr.toString(16).padStart(8, '0'));
    generateMemoryDump(newAddr);
  };

  const handleSearchMemory = () => {
    const parsedAddr = parseInt(memorySearchInput, 16);
    if (!isNaN(parsedAddr)) {
      const alignedAddr = parsedAddr - (parsedAddr % 16); 
      setMemoryAddress(alignedAddr);
      setMemorySearchInput(alignedAddr.toString(16).padStart(8, '0'));
      generateMemoryDump(alignedAddr);
    }
  };

  const toggleBreakpoint = (address: number) => {
    setAddressBreakpoints(prev => {
      const newBps = new Set(prev);
      if (newBps.has(address)) newBps.delete(address); else newBps.add(address);
      return newBps;
    });
  };

  const handleBuild = () => {
    setIsRunning(false);
    memoryInstance.current.reset();
    cpuInstance.current.reset();
    
    cpuInstance.current.onPrint('\x1b[90m[System] Initiating Build Process...\x1b[0m\r\n');

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
        if (editorBreakpoints.has(inst.originalLine)) { newAddressBps.add(inst.address); }
      }
      setDisassembly(newDisasm);
      setAddressBreakpoints(newAddressBps);

      for (const data of compiled.data) {
        for (let i = 0; i < data.data.length; i++) {
          memoryInstance.current.load8(data.address + i, data.data[i]);
        }
      }

      // SISTEM OS LOADER: Cari alamat fungsi 'main'
      const entryAddress = compiled.symbols['main'] !== undefined ? compiled.symbols['main'] : TEXT_BASE;
      entryPointRef.current = entryAddress;
      
      cpuInstance.current.reset(); 
      cpuInstance.current.pc = entryAddress; 

      generateMemoryDump(memoryAddress);
      syncUI();
      setIsCompiled(true);
      
      cpuInstance.current.onPrint(`\x1b[32;1m[Build Success]\x1b[0m Binary compiled successfully.\r\n`);
      cpuInstance.current.onPrint(`\x1b[36m$ OS Loader:\x1b[0m Entry point set to \x1b[33mmain\x1b[0m at 0x${entryAddress.toString(16).padStart(8, '0')}\r\n`);
      return true;
    } catch (err: any) {
      setDisassembly([]); setMemoryDump([]); setAddressBreakpoints(new Set()); setIsCompiled(false);
      memoryInstance.current.reset(); cpuInstance.current.reset(); syncUI();
      cpuInstance.current.onPrint(`\x1b[31;1m[Build Failed]\x1b[0m ${err.message}\r\n`);
      return false;
    }
  };

  const executeCycle = () => {
    try {
      let status: CPUStatus = 'RUNNING';
      for (let i = 0; i < 500; i++) {
        const currPc = cpuInstance.current.pc;
        if (addressBreakpoints.has(currPc) && !isResumingRef.current) {
          setIsRunning(false); syncUI();
          cpuInstance.current.onPrint(`\r\n\x1b[93m[Paused] Breakpoint hit at 0x${currPc.toString(16).padStart(8,'0')}\x1b[0m\r\n`);
          return;
        }
        isResumingRef.current = false;
        status = cpuInstance.current.step();
        if (status !== 'RUNNING') break;
      }
      if (status === 'RUNNING') requestAnimationFrame(executeCycle);
      else if (status === 'HALTED') { setIsRunning(false); syncUI(); }
    } catch (err: any) {
      setIsRunning(false); syncUI();
      cpuInstance.current.onPrint(`\r\n\x1b[31;1m[CPU Exception] ${err.message}\x1b[0m\r\n`);
    }
  };

  const handleRun = () => {
    if (isRunning) return;
    if (!isCompiled) {
      const isSuccess = handleBuild();
      if (!isSuccess) return; 
    }
    if (isMobile) setActiveTab('terminal');
    setIsRunning(true);
    isResumingRef.current = true; 
    requestAnimationFrame(executeCycle);
  };

  const handlePause = () => {
    setIsRunning(false); syncUI();
    cpuInstance.current.onPrint('\r\n\x1b[93m[Paused] Execution halted by user.\x1b[0m\r\n');
  };

  const handleStep = () => {
    if (!isCompiled) { const isSuccess = handleBuild(); if (!isSuccess) return; }
    try {
      isResumingRef.current = true; cpuInstance.current.step(); syncUI();
    } catch (err: any) { cpuInstance.current.onPrint(`\r\n\x1b[31;1m[Exception] ${err.message}\x1b[0m\r\n`); }
  };

  const handleResetCPU = () => {
    cpuInstance.current.reset();
    cpuInstance.current.pc = entryPointRef.current; 
    isResumingRef.current = false; setIsRunning(false); syncUI();
    cpuInstance.current.onPrint(`\r\n\x1b[36m$ CPU Reset.\x1b[0m PC restored to 0x${entryPointRef.current.toString(16).padStart(8, '0')}\r\n`);
  };

  const handleResetAll = () => {
    setIsCompiled(false); setIsRunning(false);
    memoryInstance.current.reset(); cpuInstance.current.reset();
    entryPointRef.current = TEXT_BASE;
    setDisassembly([]); setMemoryDump([]); syncUI();
    let deletedFiles = 0;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('mips_fs_')) { localStorage.removeItem(key); deletedFiles++; }
    });
    cpuInstance.current.onPrint('\r\n\x1b[32m[System]\x1b[0m MIPS32 OS Ready (Total Reset).\r\n');
    if (deletedFiles > 0) cpuInstance.current.onPrint(`\x1b[36m$ Cleaned up ${deletedFiles} virtual file(s).\x1b[0m\r\n`);
  };

  if (!isMounted) return <div className="flex h-screen w-screen items-center justify-center bg-[#09090b]"><span className="text-zinc-600 font-mono text-sm animate-pulse">Initializing IDE...</span></div>;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#09090b] text-zinc-300 font-sans w-full h-[100dvh] overflow-hidden">
      <style>{`
        .breakpoint-glyph { background-color: #ef4444; border-radius: 50%; width: 10px !important; height: 10px !important; margin-left: 5px; margin-top: 5px; cursor: pointer; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* TOP HEADER */}
      <header className="flex items-center justify-between h-12 px-3 border-b border-zinc-900 bg-[#0d0d0d] shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger className="md:hidden flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors">
              <Menu className="w-5 h-5"/>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-[#09090b] border-r-zinc-800 w-[280px] flex flex-col h-full">
               <Sidebar activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab} regValues={regValues} />
            </SheetContent>
          </Sheet>

          <div className="flex items-center justify-center w-7 h-7 rounded bg-zinc-900 border border-zinc-800 hidden md:flex">
            <Cpu className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-zinc-100 font-semibold hidden md:inline">MIPS Web IDE</span>
            <span className="text-zinc-600 hidden md:inline">/</span>
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800 text-emerald-400">
               <FileCode2 className="w-3.5 h-3.5" /> main.s
            </div>
          </div>
        </div>

        {/* Action Controls Desktop */}
        <div className="hidden md:flex items-center gap-2">
           <div className="flex items-center gap-1 border-r border-zinc-800 pr-3 mr-1">
             <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white" onClick={handleResetCPU} title="Reset CPU"><RotateCcw className="w-3.5 h-3.5 mr-1"/> CPU</Button>
             <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:bg-red-500/10" onClick={handleResetAll} title="Hard Reset"><AlertTriangle className="w-3.5 h-3.5 mr-1"/> Reset</Button>
           </div>
           <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-300 hover:bg-zinc-800" onClick={handleBuild} disabled={isRunning}><Hammer className="w-3.5 h-3.5 mr-1" /> Build</Button>
           <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-300 hover:bg-zinc-800" onClick={handleStep} disabled={isRunning}><StepForward className="w-3.5 h-3.5 mr-1" /> Step</Button>
           {isRunning ? (
             <Button size="sm" className="h-7 text-xs bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/30" onClick={handlePause}><Pause className="w-3.5 h-3.5 fill-current mr-1" /> Pause</Button>
           ) : (
             <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow" onClick={handleRun}><Play className="w-3.5 h-3.5 fill-current mr-1" /> Run</Button>
           )}
        </div>

        {/* Action Controls Mobile */}
        <div className="md:hidden flex items-center">
           {isRunning ? (
             <Button size="sm" className="h-8 w-8 p-0 bg-yellow-600/20 text-yellow-500" onClick={handlePause}><Pause className="w-4 h-4 fill-current" /></Button>
           ) : (
             <Button size="sm" className="h-8 w-8 p-0 bg-emerald-600 text-white" onClick={handleRun}><Play className="w-4 h-4 fill-current" /></Button>
           )}
        </div>
      </header>

      {/* PERBAIKAN: MOBILE TABS HEADER DITARUH GLOBAL (Selalu Terlihat di HP) */}
      {isMobile && (
        <div className="flex items-center px-2 pt-2 bg-[#09090b] border-b border-zinc-900 shrink-0 overflow-x-auto hide-scrollbar z-10 shadow-sm">
          <button 
            onClick={() => setActiveTab('code')}
            className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'code' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
            <Code2 className="w-3.5 h-3.5 mr-2" /> Code
          </button>
          <button 
            onClick={() => setActiveTab('disassembly')}
            className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'disassembly' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
            <FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly
          </button>
          <button 
            onClick={() => setActiveTab('memory')}
            className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'memory' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
            <Database className="w-3.5 h-3.5 mr-2" /> Memory
          </button>
          <button 
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'terminal' ? 'bg-[#0a0a0a] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
            <TerminalSquare className="w-3.5 h-3.5 mr-2" /> Terminal
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE - NATIVE FLEXBOX */}
      <div className="flex-1 flex flex-row w-full min-h-0 bg-[#0d0d0d]">
        
        {/* SIDEBAR PC */}
        <div className="hidden md:flex w-64 border-r border-zinc-900 bg-[#09090b] flex-col shrink-0">
          <Sidebar activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab} regValues={regValues} />
        </div>

        {/* CENTER + RIGHT AREA */}
        <div className="flex-1 flex flex-col md:flex-row min-w-0 h-full">
          
          {/* CENTER PANEL (Code/Disassembly/Memory) */}
          <div className={`flex-1 flex-col min-w-0 h-full ${isMobile && activeTab === 'terminal' ? 'hidden' : 'flex'}`}>
            
            {/* DESKTOP TABS HEADER (Hidden on Mobile) */}
            {!isMobile && (
              <div className="flex items-center px-2 pt-2 bg-[#09090b] border-b border-zinc-900 shrink-0 overflow-x-auto hide-scrollbar">
                <button 
                  onClick={() => setActiveTab('code')}
                  className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'code' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
                  <Code2 className="w-3.5 h-3.5 mr-2" /> Code
                </button>
                <button 
                  onClick={() => setActiveTab('disassembly')}
                  className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'disassembly' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
                  <FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly
                </button>
                <button 
                  onClick={() => setActiveTab('memory')}
                  className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'memory' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
                  <Database className="w-3.5 h-3.5 mr-2" /> Memory
                </button>
              </div>
            )}

            {/* TAB CONTENTS */}
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'code' ? 'flex' : 'hidden'}`}>
              <EditorView code={code} setCode={setCode} setIsCompiled={setIsCompiled} editorBreakpoints={editorBreakpoints} setEditorBreakpoints={setEditorBreakpoints} isMobile={isMobile} />
            </div>
            
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'disassembly' ? 'flex' : 'hidden'}`}>
              <DisassemblyView disassembly={disassembly} activePC={activePC} addressBreakpoints={addressBreakpoints} toggleBreakpoint={toggleBreakpoint} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>

            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'memory' ? 'flex' : 'hidden'}`}>
              <MemoryView memoryDump={memoryDump} memorySearchInput={memorySearchInput} setMemorySearchInput={setMemorySearchInput} handleSearchMemory={handleSearchMemory} handlePageMemory={handlePageMemory} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>
          </div>

          {/* RIGHT PANEL: TERMINAL */}
          <div className={`w-full md:w-[400px] lg:w-[450px] border-l border-zinc-900 bg-[#0a0a0a] flex-col shrink-0 min-h-0 ${isMobile && activeTab !== 'terminal' ? 'hidden' : 'flex'}`}>
             <TerminalView cpu={cpuInstance.current} activeTab={activeTab} isMobile={isMobile} syncUI={syncUI} setIsRunning={setIsRunning} requestCycle={() => requestAnimationFrame(executeCycle)} />
          </div>

        </div>
      </div>

      {/* MOBILE BOTTOM ACTION BAR */}
      {isMobile && (
        <div className="bg-[#09090b] border-t border-zinc-900 flex items-center justify-around px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)] shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-20">
          <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-12 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900/50" onClick={handleBuild}>
            <Hammer className="w-4 h-4" /> <span className="text-[10px] font-bold">Build</span>
          </Button>
          <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-12 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900/50" onClick={handleStep}>
            <StepForward className="w-4 h-4" /> <span className="text-[10px] font-bold">Step</span>
          </Button>
          <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-12 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-900/50" onClick={handleResetAll}>
            <RotateCcw className="w-4 h-4" /> <span className="text-[10px] font-bold">Reset</span>
          </Button>
          <Sheet>
            <SheetTrigger className="flex-1 flex flex-col items-center justify-center gap-1 h-12 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900/50 transition-colors">
              <Settings2 className="w-4 h-4" /> <span className="text-[10px] font-bold">Reg/File</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-0 bg-[#09090b] border-t-zinc-800 h-[70vh] flex flex-col">
               <Sidebar activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab} regValues={regValues} />
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}