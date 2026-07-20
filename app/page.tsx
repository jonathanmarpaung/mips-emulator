"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
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
# MIPS WEB EMULATOR - PROFESSIONAL IDE
# Program: Fibonacci Sequence Generator
# Demonstrasi: Subrutin (jal/jr), Loop (bge/j), dan Entry Point (.globl main)
# ==============================================================================

.data
    msg_welcome: .asciiz "=== Deret Fibonacci ===\\n"
    msg_prompt:  .asciiz "Masukkan batas jumlah deret (N): "
    msg_space:   .asciiz ", "
    msg_done:    .asciiz "\\nSelesai!\\n"

.text
.globl main

# ------------------------------------------------------------------------------
# FUNGSI: print_separator
# Sengaja diletakkan di atas 'main' untuk membuktikan Emulator 
# sekarang cerdas dan akan memulai eksekusi tepat di label 'main'.
# ------------------------------------------------------------------------------
print_separator:
    li $v0, 4
    la $a0, msg_space
    syscall
    jr $ra

# ------------------------------------------------------------------------------
# ENTRY POINT UTAMA
# ------------------------------------------------------------------------------
main:
    # Cetak Welcome
    li $v0, 4
    la $a0, msg_welcome
    syscall

    # Cetak Prompt
    la $a0, msg_prompt
    syscall

    # Baca Input Integer (N) -> $v0
    li $v0, 5
    syscall
    move $s0, $v0      # $s0 = Batas N

    # Inisialisasi Deret (a = 0, b = 1, counter = 0)
    li $t0, 0          # $t0 = a
    li $t1, 1          # $t1 = b
    li $t2, 0          # $t2 = i (counter)

fib_loop:
    bge $t2, $s0, fib_end   # Jika i >= N, lompat ke fib_end

    # Cetak nilai 'a'
    li $v0, 1
    move $a0, $t0
    syscall

    # Hitung angka Fibonacci selanjutnya (c = a + b)
    add $t3, $t0, $t1
    
    # Geser nilai (a = b, b = c)
    move $t0, $t1
    move $t1, $t3

    # Increment counter
    addi $t2, $t2, 1

    # Cek apakah ini elemen terakhir (agar tidak print koma di akhir)
    bge $t2, $s0, fib_loop

    # Panggil fungsi print koma (jal)
    jal print_separator

    j fib_loop

fib_end:
    # Cetak Pesan Selesai
    li $v0, 4
    la $a0, msg_done
    syscall

    # Exit Program
    li $v0, 10
    syscall
`;

export default function MipsEmulatorPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Tabs State
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'registers'>('files');
  const [mobileTab, setMobileTab] = useState<string>('code');
  
  // Emulator State
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
  
  // BARU: OS Loader Reference untuk melacak posisi fungsi main:
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
    
    // Memberi tahu pengguna bahwa proses build dimulai
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

      // BARU: OS LOADER - Temukan alamat 'main' dan atur sebagai Entry Point
      const entryAddress = compiled.symbols['main'] !== undefined ? compiled.symbols['main'] : TEXT_BASE;
      entryPointRef.current = entryAddress;
      
      cpuInstance.current.reset(); // Reset CPU standar (PC jadi 0x00400000)
      cpuInstance.current.pc = entryAddress; // OS Loader meng-override PC ke alamat 'main'

      generateMemoryDump(memoryAddress);
      syncUI();
      setIsCompiled(true);
      
      // Status Berhasil di Terminal
      cpuInstance.current.onPrint(`\x1b[32;1m[Build Success]\x1b[0m Binary compiled successfully.\r\n`);
      cpuInstance.current.onPrint(`\x1b[36m$ OS Loader:\x1b[0m Entry point set to \x1b[33mmain\x1b[0m at 0x${entryAddress.toString(16).padStart(8, '0')}\r\n`);
      
      return true;

    } catch (err: any) {
      setDisassembly([]);
      setMemoryDump([]);
      setAddressBreakpoints(new Set());
      setIsCompiled(false);
      memoryInstance.current.reset(); 
      cpuInstance.current.reset();
      syncUI();
      
      // Status Gagal di Terminal
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
          setIsRunning(false);
          syncUI();
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
      setIsRunning(false);
      cpuInstance.current.onPrint(`\r\n\x1b[31;1m[CPU Exception] ${err.message}\x1b[0m\r\n`);
      syncUI();
    }
  };

  const handleRun = () => {
    if (isRunning) return;
    if (!isCompiled) {
      const isSuccess = handleBuild();
      if (!isSuccess) return; 
    }
    if (isMobile) setMobileTab('terminal');
    setIsRunning(true);
    isResumingRef.current = true; 
    requestAnimationFrame(executeCycle);
  };

  const handlePause = () => {
    setIsRunning(false);
    syncUI();
    cpuInstance.current.onPrint('\r\n\x1b[93m[Paused] Execution halted by user.\x1b[0m\r\n');
  };

  const handleStep = () => {
    if (!isCompiled) { const isSuccess = handleBuild(); if (!isSuccess) return; }
    try {
      isResumingRef.current = true; 
      cpuInstance.current.step();
      syncUI();
    } catch (err: any) { 
      cpuInstance.current.onPrint(`\r\n\x1b[31;1m[Exception] ${err.message}\x1b[0m\r\n`);
    }
  };

  const handleResetCPU = () => {
    cpuInstance.current.reset();
    
    // BARU: Kembalikan PC ke Entry Point 'main', bukan ke TEXT_BASE bawaan!
    cpuInstance.current.pc = entryPointRef.current; 
    
    isResumingRef.current = false;
    setIsRunning(false);
    syncUI();
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
    <div className="flex h-screen flex-col bg-[#09090b] text-zinc-300 font-sans w-full overflow-hidden">
      <style>{`
        .breakpoint-glyph { background-color: #ef4444; border-radius: 50%; width: 10px !important; height: 10px !important; margin-left: 5px; margin-top: 5px; cursor: pointer; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* TOP HEADER */}
      <header className="flex items-center justify-between h-12 px-3 border-b border-zinc-900 bg-[#0d0d0d] shrink-0">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger className="md:hidden flex items-center justify-center w-8 h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors">
              <Menu className="w-5 h-5"/>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-[#09090b] border-r-zinc-800 w-[280px]">
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

        <div className="md:hidden flex items-center">
           {isRunning ? (
             <Button size="sm" className="h-8 w-8 p-0 bg-yellow-600/20 text-yellow-500" onClick={handlePause}><Pause className="w-4 h-4 fill-current" /></Button>
           ) : (
             <Button size="sm" className="h-8 w-8 p-0 bg-emerald-600 text-white" onClick={handleRun}><Play className="w-4 h-4 fill-current" /></Button>
           )}
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 w-full overflow-hidden flex flex-col relative">
        {!isMobile ? (
          /* DESKTOP LAYOUT */
          <div className="w-full h-full flex min-h-0">
            {/* @ts-ignore */}
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
              <ResizablePanel defaultSize={20} minSize={15} className="bg-[#09090b] border-r border-zinc-900 z-10">
                <Sidebar activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab} regValues={regValues} />
              </ResizablePanel>
              <ResizableHandle withHandle className="w-1 bg-zinc-900 hover:bg-emerald-500/50 transition-colors" />
              <ResizablePanel defaultSize={80} minSize={40} className="flex flex-col bg-[#0d0d0d] min-h-0">
                 {/* @ts-ignore */}
                 <ResizablePanelGroup direction="vertical">
                   <ResizablePanel defaultSize={70} minSize={30} className="flex flex-col bg-[#0d0d0d] min-h-0">
                      <Tabs defaultValue="code" className="flex-1 flex flex-col h-full min-h-0">
                        <div className="bg-[#09090b] border-b border-zinc-900 px-2 pt-1 flex items-end shrink-0">
                          <TabsList className="bg-transparent border-none p-0 h-8 flex gap-1">
                            <TabsTrigger value="code" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4 transition-all"><Code2 className="w-3.5 h-3.5 mr-2" /> Code</TabsTrigger>
                            <TabsTrigger value="disassembly" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4 transition-all"><FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly</TabsTrigger>
                            <TabsTrigger value="memory" className="h-full flex items-center rounded-t-md rounded-b-none border border-transparent bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4 transition-all"><Database className="w-3.5 h-3.5 mr-2" /> Memory</TabsTrigger>
                          </TabsList>
                        </div>
                        
                        <TabsContent value="code" className="flex-1 m-0 p-0 border-none outline-none relative bg-[#0d0d0d] data-[state=active]:flex flex-col min-h-0">
                          <EditorView code={code} setCode={setCode} setIsCompiled={setIsCompiled} editorBreakpoints={editorBreakpoints} setEditorBreakpoints={setEditorBreakpoints} isMobile={isMobile} />
                        </TabsContent>
                        <TabsContent value="disassembly" className="flex-1 m-0 bg-[#0d0d0d] overflow-hidden outline-none data-[state=active]:flex flex-col min-h-0">
                           <DisassemblyView disassembly={disassembly} activePC={activePC} addressBreakpoints={addressBreakpoints} toggleBreakpoint={toggleBreakpoint} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
                        </TabsContent>
                        <TabsContent value="memory" className="flex-1 m-0 bg-[#0d0d0d] overflow-hidden outline-none data-[state=active]:flex flex-col min-h-0">
                           <MemoryView memoryDump={memoryDump} memorySearchInput={memorySearchInput} setMemorySearchInput={setMemorySearchInput} handleSearchMemory={handleSearchMemory} handlePageMemory={handlePageMemory} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
                        </TabsContent>
                      </Tabs>
                   </ResizablePanel>
                   <ResizableHandle withHandle className="w-1 bg-zinc-900 hover:bg-emerald-500/50 transition-colors" />
                   <ResizablePanel defaultSize={30} minSize={15} className="bg-[#0a0a0a] min-h-0 flex flex-col">
                      <TerminalView cpu={cpuInstance.current} activeTab="terminal" isMobile={isMobile} syncUI={syncUI} setIsRunning={setIsRunning} requestCycle={() => requestAnimationFrame(executeCycle)} />
                   </ResizablePanel>
                 </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        ) : (
          /* MOBILE LAYOUT */
          <div className="flex flex-col w-full h-full bg-[#0d0d0d] min-h-0">
             <Tabs value={mobileTab} onValueChange={setMobileTab} className="flex-1 flex flex-col h-full min-h-0 w-full">
                <div className="bg-[#09090b] border-b border-zinc-900 px-2 pt-2 flex items-end shrink-0 overflow-x-auto hide-scrollbar">
                  <TabsList className="bg-transparent border-none p-0 h-9 flex gap-1 shrink-0">
                    <TabsTrigger value="code" className="h-full flex items-center rounded-t border border-transparent bg-zinc-900 text-zinc-400 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4">Code</TabsTrigger>
                    <TabsTrigger value="disassembly" className="h-full flex items-center rounded-t border border-transparent bg-zinc-900 text-zinc-400 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4">Disassembly</TabsTrigger>
                    <TabsTrigger value="memory" className="h-full flex items-center rounded-t border border-transparent bg-zinc-900 text-zinc-400 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4">Memory</TabsTrigger>
                    <TabsTrigger value="terminal" className="h-full flex items-center rounded-t border border-transparent bg-zinc-900 text-zinc-400 data-[state=active]:border-zinc-800 data-[state=active]:border-b-[#0d0d0d] data-[state=active]:bg-[#0d0d0d] data-[state=active]:text-emerald-500 text-xs px-4">Terminal</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="code" className="flex-1 m-0 p-0 border-none outline-none bg-[#0d0d0d] data-[state=active]:flex flex-col min-h-0 w-full">
                  <EditorView code={code} setCode={setCode} setIsCompiled={setIsCompiled} editorBreakpoints={editorBreakpoints} setEditorBreakpoints={setEditorBreakpoints} isMobile={isMobile} />
                </TabsContent>

                <TabsContent value="disassembly" className="flex-1 m-0 bg-[#0d0d0d] overflow-hidden outline-none data-[state=active]:flex flex-col min-h-0 w-full border-none">
                  <DisassemblyView disassembly={disassembly} activePC={activePC} addressBreakpoints={addressBreakpoints} toggleBreakpoint={toggleBreakpoint} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
                </TabsContent>

                <TabsContent value="memory" className="flex-1 m-0 bg-[#0d0d0d] overflow-hidden outline-none data-[state=active]:flex flex-col min-h-0 w-full border-none">
                  <MemoryView memoryDump={memoryDump} memorySearchInput={memorySearchInput} setMemorySearchInput={setMemorySearchInput} handleSearchMemory={handleSearchMemory} handlePageMemory={handlePageMemory} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
                </TabsContent>

                <TabsContent value="terminal" className="flex-1 m-0 bg-[#0a0a0a] relative min-h-0 w-full border-none outline-none data-[state=active]:flex flex-col">
                  <TerminalView cpu={cpuInstance.current} activeTab={mobileTab} isMobile={isMobile} syncUI={syncUI} setIsRunning={setIsRunning} requestCycle={() => requestAnimationFrame(executeCycle)} />
                </TabsContent>
             </Tabs>

             {/* Bottom Mobile Action Bar */}
             <div className="h-12 bg-[#09090b] border-t border-zinc-900 flex items-center justify-around px-2 shrink-0 pb-1">
               <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-full rounded-none text-zinc-500 hover:text-emerald-400" onClick={handleBuild}>
                 <Hammer className="w-4 h-4" /> <span className="text-[9px] uppercase tracking-wider font-bold">Build</span>
               </Button>
               <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-full rounded-none text-zinc-500 hover:text-emerald-400" onClick={handleStep}>
                 <StepForward className="w-4 h-4" /> <span className="text-[9px] uppercase tracking-wider font-bold">Step</span>
               </Button>
               <Button variant="ghost" className="flex-1 flex flex-col gap-1 h-full rounded-none text-zinc-500 hover:text-red-400" onClick={handleResetAll}>
                 <RotateCcw className="w-4 h-4" /> <span className="text-[9px] uppercase tracking-wider font-bold">Reset</span>
               </Button>
               <Sheet>
                 <SheetTrigger className="flex-1 flex flex-col items-center justify-center gap-1 h-full text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 transition-colors">
                   <Settings2 className="w-4 h-4" /> <span className="text-[9px] uppercase tracking-wider font-bold">Reg/File</span>
                 </SheetTrigger>
                 <SheetContent side="bottom" className="p-0 bg-[#09090b] border-t-zinc-800 h-[60vh]">
                    <Sidebar activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab} regValues={regValues} />
                 </SheetContent>
               </Sheet>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}