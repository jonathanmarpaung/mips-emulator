import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { TerminalSquare, RotateCcw } from "lucide-react";
import { CPU } from '@/core/cpu';

// PERBAIKAN: Import CSS secara statis di sini agar teks tidak terpotong!
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  cpu: CPU;
  activeTab: string;
  isMobile: boolean;
  syncUI: () => void;
  setIsRunning: (v: boolean) => void;
  requestCycle: () => void;
}

export function TerminalView({ cpu, activeTab, isMobile, syncUI, setIsRunning, requestCycle }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<any>(null);
  const fitAddonInstance = useRef<any>(null);
  const inputDisposable = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    let term: any;
    let fitAddon: any;
    let isComponentMounted = true; 

    const initTerm = async () => {
      setIsLoaded(false);
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      if (!isComponentMounted) return;
      el.innerHTML = '';

      term = new Terminal({
        theme: { background: '#0a0a0a', foreground: '#e4e4e7', cursor: '#10b981', selectionBackground: '#27272a' },
        fontFamily: "'Geist Mono', monospace", 
        fontSize: 13, 
        cursorBlink: true,
        rows: 24 
      });

      fitAddon = new FitAddon();
      fitAddonInstance.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(el);
      termInstance.current = term;
      
      if (el.clientWidth > 0 && el.clientHeight > 0) {
         try { fitAddon.fit(); } catch(e){}
      }

      term.writeln('\x1b[32;1m[System]\x1b[0m MIPS32 Environment Initialized.');
      setIsLoaded(true);

      cpu.onPrint = (text: string) => term.write(text.replace(/\n/g, '\r\n'));
      cpu.onExit = (exitCode: number) => {
        term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
        setIsRunning(false);
        syncUI();
      };

      cpu.onInputRequired = (type) => {
        let inputBuffer = '';
        term.write(type === 'float' ? '\x1b[36m' : '\x1b[33m'); 
        inputDisposable.current = term.onData((data: string) => {
          const code = data.charCodeAt(0);
          if (code === 13) { 
            term.write('\x1b[0m\r\n'); 
            const val = type === 'float' ? (parseFloat(inputBuffer) || 0) : (parseInt(inputBuffer, 10) || 0);
            if (inputDisposable.current) inputDisposable.current.dispose();
            cpu.provideInput(val, type);
            requestCycle(); 
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
    };

    initTerm();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        try { fitAddon?.fit(); } catch(e){}
      }
    });
    ro.observe(el);

    return () => {
      isComponentMounted = false; 
      ro.disconnect();
      if (inputDisposable.current) inputDisposable.current.dispose();
      if (term) term.dispose();
    };
  }, []); 

  useEffect(() => {
    if (isMobile && activeTab === 'terminal') {
      setTimeout(() => {
        const el = terminalRef.current;
        if (el && el.clientWidth > 0 && el.clientHeight > 0) {
           try { fitAddonInstance.current?.fit(); } catch(e){}
        }
      }, 100); 
    }
  }, [activeTab, isMobile]);

  const handleClear = () => {
    termInstance.current?.clear();
  };

  return (
    <div className="h-full flex flex-col relative w-full min-h-0 min-w-0 bg-[#0a0a0a]">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-20">
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono animate-pulse">Booting Console...</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-900 bg-[#09090b] shrink-0">
        <div className="flex items-center gap-2 text-zinc-400">
          <TerminalSquare className="w-3.5 h-3.5" />
          <span className="text-[10px] uppercase font-bold tracking-widest">Terminal Output</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded" onClick={handleClear}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex-1 p-2 relative min-h-0 min-w-0 w-full overflow-hidden">
         <div className="absolute inset-2" ref={terminalRef}></div>
      </div>
    </div>
  );
}