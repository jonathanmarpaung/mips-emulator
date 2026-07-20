import React from 'react';
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface MemoryViewProps {
  memoryDump: any[];
  memorySearchInput: string;
  setMemorySearchInput: (val: string) => void;
  handleSearchMemory: () => void;
  handlePageMemory: (offset: number) => void;
  viewFontSize: number;
  setViewFontSize: (val: number) => void;
}

export function MemoryView({ memoryDump, memorySearchInput, setMemorySearchInput, handleSearchMemory, handlePageMemory, viewFontSize, setViewFontSize }: MemoryViewProps) {
  return (
    <div className="flex-1 m-0 flex flex-col bg-[#0d0d0d] overflow-hidden min-h-0 w-full h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-500 hidden md:block" />
          <span className="text-zinc-500 font-mono text-[10px] md:hidden">0x</span>
          <input type="text" value={memorySearchInput} onChange={(e) => setMemorySearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchMemory()} className="h-6 w-20 md:w-24 bg-transparent border-b border-zinc-700 px-1 text-xs font-mono text-zinc-300 outline-none focus:border-emerald-500 transition-colors" placeholder="00000000" />
          <div className="flex items-center gap-0.5 ml-1">
            <Button variant="outline" size="icon" className="h-6 w-6 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white" onClick={() => handlePageMemory(-256)}><ChevronLeft className="w-3.5 h-3.5"/></Button>
            <Button variant="outline" size="icon" className="h-6 w-6 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white" onClick={() => handlePageMemory(256)}><ChevronRight className="w-3.5 h-3.5"/></Button>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 rounded border border-zinc-800 p-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400" onClick={() => setViewFontSize(Math.max(10, viewFontSize - 1))}><ZoomOut className="w-3 h-3"/></Button>
          <span className="text-[10px] text-zinc-400 font-mono w-6 text-center">{viewFontSize}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400" onClick={() => setViewFontSize(Math.min(24, viewFontSize + 1))}><ZoomIn className="w-3 h-3"/></Button>
        </div>
      </div>
      {/* PENTING: overflow-y-auto */}
      <div className="flex-1 overflow-y-auto relative min-h-0 w-full">
        <table className="w-full text-left border-collapse min-w-[320px]">
          <thead className="sticky top-0 bg-[#09090b]/95 backdrop-blur z-10 border-b border-zinc-900">
            <tr>
              <th className="px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-zinc-500 uppercase tracking-widest w-20 md:w-28">Address</th>
              <th className="px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-zinc-500 uppercase tracking-widest border-l border-zinc-900">Hex Dump & ASCII</th>
            </tr>
          </thead>
          <tbody className="font-mono" style={{ fontSize: `${viewFontSize}px` }}>
            {memoryDump.length === 0 ? (
               <tr><td colSpan={2} className="p-8 text-center text-zinc-700 text-xs">Awaiting Compilation...</td></tr>
            ) : (
              memoryDump.map((row, idx) => (
                <tr key={idx} className="border-b border-zinc-900/50 hover:bg-zinc-900/50">
                  <td className="px-3 py-2 md:py-1.5 font-semibold text-zinc-500">{row.address}</td>
                  <td className="px-3 py-2 md:py-1.5 border-l border-zinc-900/50 flex gap-4 md:gap-6 items-center overflow-x-auto hide-scrollbar">
                    <span className="text-zinc-300 tracking-widest whitespace-nowrap">
                      {row.words.map((w: string, i: number) => <span key={i} className={w === '00000000' ? 'text-zinc-700' : 'text-emerald-100'}>{w}{i < 3 ? '  ' : ''}</span>)}
                    </span>
                    <span className="font-bold tracking-widest border-l border-zinc-800 pl-3 md:pl-4 whitespace-nowrap">
                      {row.ascii.split('').map((char: string, i: number) => <span key={i} className={char === '.' ? 'text-zinc-800' : 'text-zinc-400'}>{char}</span>)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
