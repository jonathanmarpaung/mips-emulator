"use client";

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Play, StepForward, RotateCcw, Hammer, Pause, AlertTriangle,
  Cpu, Code2, FileCode2, Database, Menu, TerminalSquare, LayoutList, FolderCode,
  File as FileIcon, X
} from "lucide-react";

// =======================================================================
// IMPORT INTI EMULATOR & MEMORY
// =======================================================================
import { Memory, DATA_BASE, TEXT_BASE } from '@/core/memory';
import { CPU, CPUStatus } from '@/core/cpu';
import { Assembler } from '@/core/assembler';

// =======================================================================
// IMPORT KOMPONEN UI
// =======================================================================
import { DisassemblyView } from '@/components/emulator/DisassemblyView';
import { MemoryView } from '@/components/emulator/MemoryView';
import { RegistersView } from '@/components/emulator/RegistersView';
import { FileExplorer } from '@/components/emulator/FileExplorer';

// =======================================================================
// OPTIMASI PERFORMA: LAZY LOADING
// =======================================================================
const EditorView = dynamic(
  () => import('@/components/emulator/EditorView').then(mod => mod.EditorView),
  { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-zinc-600 text-xs font-mono">Preparing Editor...</div> }
);

const TerminalView = dynamic(
  () => import('@/components/emulator/TerminalView').then(mod => mod.TerminalView),
  { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] text-zinc-600 text-xs font-mono">Preparing Terminal...</div> }
);

// =======================================================================
// ENGLISH TEMPLATES FOR NEW USERS
// =======================================================================
const DEFAULT_MAIN_CODE = `# ==============================================================================
# MIPS OS WEB IDE
# Example: Entry Point & Multi-file support
# ==============================================================================

.include "utils/math.s"

.data
    hello: .asciiz "Hello from MIPS OS!\\n"
    result_msg: .asciiz "Calculation result of 10 + 5 = "

.text
.globl main

main:
    # 1. Print Hello String
    li $v0, 4
    la $a0, hello
    syscall

    # 2. Prepare parameters for add_numbers function (in utils/math.s)
    li $a0, 10
    li $a1, 5
    jal add_numbers

    # 3. Save return value ($v0) to temporary register ($t0)
    move $t0, $v0

    # 4. Print result message
    li $v0, 4
    la $a0, result_msg
    syscall

    # 5. Print result number (in $t0)
    li $v0, 1
    move $a0, $t0
    syscall

    # 6. Exit program
    li $v0, 10
    syscall
`;

const DEFAULT_MATH_CODE = `# File: utils/math.s
# Math utility functions

add_numbers:
    # Adds $a0 and $a1, returns result in $v0
    add $v0, $a0, $a1
    jr $ra
`;

export default function MipsEmulatorPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Tab Navigasi Inti (UI Global)
  const [activeTab, setActiveTab] = useState<string>('code');
  
  // =======================================================================
  // MULTI-FILE SYSTEM STATE
  // =======================================================================
  const [files, setFiles] = useState<string[]>(['main.s']);
  const [activeFile, setActiveFile] = useState<string>('main.s');
  const [openTabs, setOpenTabs] = useState<string[]>(['main.s']); 
  
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    'main.s': DEFAULT_MAIN_CODE
  });

  // =======================================================================
  // EMULATOR STATE & REFS
  // =======================================================================
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

  // Inisialisasi Inti 
  const memoryInstance = useRef(new Memory());
  const cpuInstance = useRef(new CPU(memoryInstance.current));
  const assemblerInstance = useRef(new Assembler());
  const isResumingRef = useRef(false);
  const entryPointRef = useRef<number>(TEXT_BASE);

  // =======================================================================
  // INITIALIZATION & EVENT LISTENERS
  // =======================================================================
  useEffect(() => {
    setIsMounted(true);
    
    const loadedFiles: string[] = [];
    const loadedContents: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mips_fs_')) {
        const filename = key.replace('mips_fs_', '');
        loadedFiles.push(filename);
        loadedContents[filename] = localStorage.getItem(key) || '';
      }
    }
    
    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      setFileContents(loadedContents);
      const initialFile = loadedFiles.includes('main.s') ? 'main.s' : loadedFiles[0];
      setActiveFile(initialFile);
      setOpenTabs([initialFile]);
    } else {
      const defaultFiles = ['main.s', 'utils/.keep', 'utils/math.s'];
      const defaultContents: Record<string, string> = {
        'main.s': DEFAULT_MAIN_CODE,
        'utils/.keep': '',
        'utils/math.s': DEFAULT_MATH_CODE
      };

      defaultFiles.forEach(f => {
        localStorage.setItem(`mips_fs_${f}`, defaultContents[f]);
      });

      setFiles(defaultFiles);
      setFileContents(defaultContents);
      setActiveFile('main.s');
      setOpenTabs(['main.s']);
    }

    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    syncUI();
    return () => window.removeEventListener('resize', handleResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOpenTabs(prev => prev.filter(tab => files.includes(tab)));
  }, [files]);

  // =======================================================================
  // CUSTOM NATIVE RESIZER LOGIC (PENGGANTI LIBRARY)
  // =======================================================================
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [terminalWidth, setTerminalWidth] = useState(400);

  const startResizingSidebar = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = Math.max(150, Math.min(500, startWidth + mouseMoveEvent.clientX - startX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const startResizingTerminal = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = terminalWidth;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = Math.max(250, Math.min(800, startWidth - (mouseMoveEvent.clientX - startX)));
      setTerminalWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // =======================================================================
  // LOGIKA MULTI-FILE, EDITOR TABS & DRAG REORDERING
  // =======================================================================
  const handleOpenFile = (filename: string) => {
    if (!openTabs.includes(filename)) {
      setOpenTabs(prev => [...prev, filename]);
    }
    setActiveFile(filename);
  };

  const closeTab = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t !== filename);
    setOpenTabs(newTabs);
    
    if (activeFile === filename) {
      setActiveFile(newTabs.length > 0 ? newTabs[newTabs.length - 1] : '');
    }
  };

  const handleCodeChange = (newCode: string) => {
    setFileContents(prev => ({ ...prev, [activeFile]: newCode }));
    localStorage.setItem(`mips_fs_${activeFile}`, newCode);
    setIsCompiled(false);
  };

  // Drag and Drop (Swap) Logic for Tabs
  const handleTabDragStart = (e: React.DragEvent, tab: string) => {
    e.dataTransfer.setData('text/plain', tab);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTabDragOver = (e: React.DragEvent) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = (e: React.DragEvent, targetTab: string) => {
    e.preventDefault();
    const sourceTab = e.dataTransfer.getData('text/plain');
    if (!sourceTab || sourceTab === targetTab) return;

    setOpenTabs(prev => {
      const newTabs = [...prev];
      const sourceIndex = newTabs.indexOf(sourceTab);
      const targetIndex = newTabs.indexOf(targetTab);
      
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      newTabs.splice(sourceIndex, 1); // Cabut tab dari posisi lama
      newTabs.splice(targetIndex, 0, sourceTab); // Masukkan ke posisi baru
      return newTabs;
    });
  };

  // =======================================================================
  // LOGIKA EMULATOR & ASSEMBLER
  // =======================================================================
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

  const handleSearchMemory = (overrideAddr?: any) => {
    // 1. Mencegah reload halaman jika fungsi dipanggil dari form (tekan Enter)
    if (overrideAddr && typeof overrideAddr === 'object' && overrideAddr.preventDefault) {
      overrideAddr.preventDefault();
    }
    
    // 2. Ambil target: Jika berupa string (dari tombol Quick Jump), gunakan itu. Jika tidak, gunakan input state.
    const targetStr = typeof overrideAddr === 'string' ? overrideAddr : memorySearchInput;
    
    const parsedAddr = parseInt(targetStr, 16);
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
      const codeToCompile = fileContents['main.s'] !== undefined ? fileContents['main.s'] : fileContents[activeFile];
      
      if (!codeToCompile) {
        throw new Error("No code found to compile.");
      }

      const compiled = assemblerInstance.current.compile(codeToCompile);
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
    setIsCompiled(false); 
    setIsRunning(false);
    memoryInstance.current.reset(); 
    cpuInstance.current.reset();
    entryPointRef.current = TEXT_BASE;
    setDisassembly([]); 
    setMemoryDump([]); 
    syncUI();
    
    cpuInstance.current.onPrint('\r\n\x1b[32m[System]\x1b[0m MIPS32 OS Ready (Emulator Reset).\r\n');
    cpuInstance.current.onPrint('\x1b[36m$ Workspace files remain safe.\x1b[0m\r\n');
  };

  if (!isMounted) return <div className="flex h-screen w-screen items-center justify-center bg-[#09090b]"><span className="text-zinc-600 font-mono text-sm animate-pulse">Initializing IDE...</span></div>;

  // =======================================================================
  // RENDER UI
  // =======================================================================
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
            <SheetContent side="left" className="p-0 bg-[#09090b] border-r-zinc-800 w-[280px] flex flex-col h-full overflow-hidden [&>button]:text-zinc-400 [&>button]:z-50">
               <FileExplorer files={files} setFiles={setFiles} activeFile={activeFile} setActiveFile={handleOpenFile} fileContents={fileContents} setFileContents={setFileContents} />
            </SheetContent>
          </Sheet>

          <div className="flex items-center justify-center w-7 h-7 rounded bg-zinc-900 border border-zinc-800 hidden md:flex">
            <Cpu className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-zinc-100 font-semibold hidden md:inline">MIPS Web IDE</span>
            <span className="text-zinc-600 hidden md:inline">/</span>
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800 text-emerald-400 max-w-[120px] md:max-w-none truncate">
               <FileCode2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{activeFile ? activeFile.split('/').pop() : 'No file'}</span>
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

      {/* TABS HEADER GLOBAL */}
      <div 
        className="flex items-center px-2 pt-2 bg-[#09090b] border-b border-zinc-900 shrink-0 overflow-x-auto hide-scrollbar z-10 shadow-sm w-full touch-pan-x" 
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button onClick={() => setActiveTab('code')} className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'code' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
          <Code2 className="w-3.5 h-3.5 mr-2" /> Code
        </button>
        <button onClick={() => setActiveTab('disassembly')} className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'disassembly' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
          <FileCode2 className="w-3.5 h-3.5 mr-2" /> Disassembly
        </button>
        <button onClick={() => setActiveTab('memory')} className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'memory' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
          <Database className="w-3.5 h-3.5 mr-2" /> Memory
        </button>
        <button onClick={() => setActiveTab('registers')} className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'registers' ? 'bg-[#0d0d0d] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
          <LayoutList className="w-3.5 h-3.5 mr-2" /> Registers
        </button>
        {isMobile && (
          <button onClick={() => setActiveTab('terminal')} className={`flex items-center h-8 px-4 text-xs rounded-t-md border border-transparent transition-all whitespace-nowrap ${activeTab === 'terminal' ? 'bg-[#0a0a0a] text-emerald-500 border-zinc-800 border-b-transparent' : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'}`}>
            <TerminalSquare className="w-3.5 h-3.5 mr-2" /> Terminal
          </button>
        )}
      </div>

      {/* MAIN WORKSPACE (Native Resizer untuk Desktop / Flex untuk Mobile) */}
      {isMobile ? (
        // ======================= LAYOUT MOBILE (FLEXBOX MURNI) =======================
        <div className="flex-1 flex flex-col md:flex-row min-w-0 h-full">
          {/* MOBILE CENTER PANEL */}
          <div className={`flex-1 flex-col min-w-0 h-full ${activeTab === 'terminal' ? 'hidden' : 'flex'}`}>
            
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] relative ${activeTab === 'code' ? 'flex' : 'hidden'}`}>
              
              {/* TABS FILE UNTUK MOBILE */}
              <div 
                className="flex items-center bg-[#09090b] border-b border-zinc-800 overflow-x-auto shrink-0 hide-scrollbar w-full touch-pan-x" 
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {openTabs.map(file => (
                  <div 
                    key={file} 
                    onClick={() => setActiveFile(file)} 
                    // Event Drag Drop ditambahkan di sini
                    draggable
                    onDragStart={(e) => handleTabDragStart(e, file)}
                    onDragOver={handleTabDragOver}
                    onDrop={(e) => handleTabDrop(e, file)}
                    className={`group flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-zinc-800 border-b-2 text-sm transition-colors min-w-max shrink-0 select-none ${activeFile === file ? 'border-b-emerald-500 bg-[#1e1e1e] text-emerald-400' : 'border-b-transparent bg-[#09090b] text-zinc-500 hover:bg-[#18181b]'}`}
                  >
                    <FileIcon size={14} className={activeFile === file ? "text-emerald-500" : "text-zinc-500"} />
                    <span>{file.split('/').pop()}</span>
                    <button onClick={(e) => closeTab(file, e)} className={`ml-1 transition-opacity p-0.5 rounded ${activeFile === file ? 'opacity-100 text-zinc-400 hover:text-rose-400 hover:bg-zinc-700' : 'opacity-0 group-hover:opacity-100 hover:text-rose-400'}`} title="Close Tab"><X size={13} /></button>
                  </div>
                ))}
              </div>

              {/* EDITOR VIEW */}
              <div className="flex-1 relative">
                <div className="absolute inset-0">
                  {activeFile ? (
                    <EditorView key={activeFile} code={fileContents[activeFile] || ''} setCode={handleCodeChange} setIsCompiled={setIsCompiled} editorBreakpoints={editorBreakpoints} setEditorBreakpoints={setEditorBreakpoints} isMobile={isMobile} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm bg-[#1e1e1e]">Select or create a file to start editing.</div>
                  )}
                </div>
              </div>
            </div>

            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'disassembly' ? 'flex' : 'hidden'}`}>
              <DisassemblyView disassembly={disassembly} activePC={activePC} addressBreakpoints={addressBreakpoints} toggleBreakpoint={toggleBreakpoint} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'memory' ? 'flex' : 'hidden'}`}>
              <MemoryView memoryDump={memoryDump} memorySearchInput={memorySearchInput} setMemorySearchInput={setMemorySearchInput} handleSearchMemory={handleSearchMemory} handlePageMemory={handlePageMemory} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'registers' ? 'flex' : 'hidden'}`}>
              <RegistersView regValues={regValues} />
            </div>
          </div>

          {/* MOBILE TERMINAL PANEL */}
          <div className={`w-full border-l border-zinc-900 bg-[#0a0a0a] flex-col shrink-0 min-h-0 ${activeTab !== 'terminal' ? 'hidden' : 'flex'}`}>
             <TerminalView cpu={cpuInstance.current} activeTab={activeTab} isMobile={isMobile} syncUI={syncUI} setIsRunning={setIsRunning} requestCycle={() => requestAnimationFrame(executeCycle)} />
          </div>
        </div>

      ) : (
        // ======================= LAYOUT DESKTOP (NATIVE DRAG RESIZER) =======================
        <div className="flex-1 flex flex-row w-full min-h-0 bg-[#0d0d0d]">
          
          {/* PC PANEL 1: SIDEBAR (File Explorer) */}
          <div 
            style={{ width: sidebarWidth, minWidth: '150px' }} 
            className="hidden md:flex flex-col bg-[#09090b] border-r border-zinc-900 shrink-0"
          >
            <FileExplorer files={files} setFiles={setFiles} activeFile={activeFile} setActiveFile={handleOpenFile} fileContents={fileContents} setFileContents={setFileContents} />
          </div>

          {/* RESIZER 1 */}
          <div 
            onMouseDown={startResizingSidebar} 
            className="hidden md:block w-1.5 bg-zinc-900 hover:bg-emerald-500 cursor-col-resize z-10 shrink-0 transition-colors" 
          />

          {/* PC PANEL 2: CENTER WORKSPACE */}
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] relative ${activeTab === 'code' ? 'flex' : 'hidden'}`}>
              
              {/* TABS FILE UNTUK DESKTOP (Dengan Drag & Drop) */}
              <div 
                className="flex items-center bg-[#09090b] border-b border-zinc-800 overflow-x-auto shrink-0 hide-scrollbar w-full"
              >
                {openTabs.map(file => (
                  <div 
                    key={file} 
                    onClick={() => setActiveFile(file)} 
                    // Event Drag Drop ditambahkan di sini
                    draggable
                    onDragStart={(e) => handleTabDragStart(e, file)}
                    onDragOver={handleTabDragOver}
                    onDrop={(e) => handleTabDrop(e, file)}
                    className={`group flex items-center gap-2 px-4 py-2 cursor-pointer border-r border-zinc-800 border-b-2 text-sm transition-colors min-w-max shrink-0 select-none ${activeFile === file ? 'border-b-emerald-500 bg-[#1e1e1e] text-emerald-400' : 'border-b-transparent bg-[#09090b] text-zinc-500 hover:bg-[#18181b]'}`}
                  >
                    <FileIcon size={14} className={activeFile === file ? "text-emerald-500" : "text-zinc-500"} />
                    <span>{file.split('/').pop()}</span>
                    <button onClick={(e) => closeTab(file, e)} className={`ml-1 transition-opacity p-0.5 rounded ${activeFile === file ? 'opacity-100 text-zinc-400 hover:text-rose-400 hover:bg-zinc-700' : 'opacity-0 group-hover:opacity-100 hover:text-rose-400'}`} title="Close Tab"><X size={13} /></button>
                  </div>
                ))}
              </div>

              {/* EDITOR VIEW */}
              <div className="flex-1 relative">
                <div className="absolute inset-0">
                  {activeFile ? (
                    <EditorView key={activeFile} code={fileContents[activeFile] || ''} setCode={handleCodeChange} setIsCompiled={setIsCompiled} editorBreakpoints={editorBreakpoints} setEditorBreakpoints={setEditorBreakpoints} isMobile={isMobile} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm bg-[#1e1e1e]">Select or create a file to start editing.</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'disassembly' ? 'flex' : 'hidden'}`}>
              <DisassemblyView disassembly={disassembly} activePC={activePC} addressBreakpoints={addressBreakpoints} toggleBreakpoint={toggleBreakpoint} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'memory' ? 'flex' : 'hidden'}`}>
              <MemoryView memoryDump={memoryDump} memorySearchInput={memorySearchInput} setMemorySearchInput={setMemorySearchInput} handleSearchMemory={handleSearchMemory} handlePageMemory={handlePageMemory} viewFontSize={viewFontSize} setViewFontSize={setViewFontSize} />
            </div>
            <div className={`flex-1 min-h-0 flex-col w-full bg-[#0d0d0d] ${activeTab === 'registers' ? 'flex' : 'hidden'}`}>
              <RegistersView regValues={regValues} />
            </div>
          </div>

          {/* RESIZER 2 (Hanya muncul jika Terminal terbuka) */}
          <div 
            onMouseDown={startResizingTerminal} 
            className={`hidden md:block w-1.5 bg-zinc-900 hover:bg-emerald-500 cursor-col-resize z-10 shrink-0 transition-colors ${activeTab !== 'terminal' && !isMobile ? '' : 'hidden'}`} 
          />

          {/* PC PANEL 3: TERMINAL */}
          <div 
            style={{ width: terminalWidth, minWidth: '250px' }} 
            className={`flex-col bg-[#0a0a0a] border-l border-zinc-900 shrink-0 min-h-0 ${activeTab !== 'terminal' && !isMobile ? 'flex' : 'hidden'}`}
          >
             <TerminalView cpu={cpuInstance.current} activeTab={activeTab} isMobile={isMobile} syncUI={syncUI} setIsRunning={setIsRunning} requestCycle={() => requestAnimationFrame(executeCycle)} />
          </div>

        </div>
      )}

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
              <FolderCode className="w-4 h-4" /> <span className="text-[10px] font-bold">Files</span>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-[#09090b] border-r-zinc-800 w-[280px] flex flex-col h-full overflow-hidden [&>button]:text-zinc-400 [&>button]:z-50">
               <FileExplorer files={files} setFiles={setFiles} activeFile={activeFile} setActiveFile={handleOpenFile} fileContents={fileContents} setFileContents={setFileContents} />
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}