import React from 'react';
import { Search, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Database } from 'lucide-react';

interface MemoryViewProps {
  memoryDump: any[];
  memorySearchInput: string;
  setMemorySearchInput: React.Dispatch<React.SetStateAction<string>>;
  handleSearchMemory: (overrideAddr?: any) => void; // Diubah menjadi 'any' agar aman dari error TS
  handlePageMemory: (offset: number) => void;
  viewFontSize: number;
  setViewFontSize: React.Dispatch<React.SetStateAction<number>>;
}

export function MemoryView({
  memoryDump, memorySearchInput, setMemorySearchInput, handleSearchMemory, handlePageMemory, viewFontSize, setViewFontSize
}: MemoryViewProps) {
  
  // Daftar Segmen Memori MIPS Standar
  const segments = [
    { label: '.text', addr: '00400000', color: 'text-blue-400' },
    { label: '.data', addr: '10010000', color: 'text-emerald-400' },
    { label: 'heap', addr: '10040000', color: 'text-yellow-400' },
    { label: 'stack', addr: '7fffeff0', color: 'text-rose-400' }
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d0d] font-sans">
      
      {/* ===================================================================== */}
      {/* TOOLBAR ATAS (Tombol Segment, Input Search, Pagination, Zoom)         */}
      {/* ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-zinc-800 bg-[#121214] gap-3 shrink-0">
         
         {/* KIRI: Tombol Pintas Segmen (Quick Jump) */}
         <div className="flex items-center bg-[#09090b] p-1 rounded-md border border-zinc-800 overflow-x-auto hide-scrollbar">
            <div className="px-2 flex items-center gap-1.5 border-r border-zinc-800 mr-1 shrink-0">
              <Database size={13} className="text-zinc-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest hidden sm:inline">Jump</span>
            </div>
            {segments.map(seg => (
              <button
                key={seg.label}
                type="button" // Memastikan tombol ini tidak submit form
                onClick={() => {
                  setMemorySearchInput(seg.addr);
                  handleSearchMemory(seg.addr); // Lempar address langsung ke fungsi pencarian
                }}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors hover:bg-zinc-800 ${seg.color} opacity-80 hover:opacity-100 shrink-0`}
              >
                {seg.label}
              </button>
            ))}
         </div>

         {/* KANAN: Kontrol Input, Paginasi & Zoom */}
         <div className="flex items-center gap-2 ml-auto">
            
            {/* Input Manual Address */}
            <form 
              onSubmit={(e) => handleSearchMemory(e)} 
              className="flex items-center bg-[#09090b] border border-zinc-800 rounded focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all overflow-hidden shrink-0"
            >
              <span className="text-zinc-500 pl-2 text-xs font-mono select-none">0x</span>
              <input 
                type="text"
                value={memorySearchInput}
                onChange={(e) => setMemorySearchInput(e.target.value)}
                placeholder="address"
                className="bg-transparent border-none focus:outline-none text-zinc-300 text-xs font-mono w-20 px-1 py-1.5"
              />
              <button type="submit" className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors border-l border-zinc-800" title="Go / Enter">
                <Search size={13} />
              </button>
            </form>

            {/* Tombol Paginasi (-0x100 dan +0x100) */}
            <div className="flex items-center bg-[#09090b] border border-zinc-800 rounded overflow-hidden shrink-0">
              <button onClick={() => handlePageMemory(-0x100)} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors" title="Page Up (-0x100)">
                <ArrowUp size={14} />
              </button>
              <button onClick={() => handlePageMemory(0x100)} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors border-l border-zinc-800" title="Page Down (+0x100)">
                <ArrowDown size={14} />
              </button>
            </div>

            {/* Tombol Zoom (Hanya PC) */}
            <div className="hidden sm:flex items-center bg-[#09090b] border border-zinc-800 rounded overflow-hidden shrink-0">
              <button onClick={() => setViewFontSize(Math.max(10, viewFontSize - 1))} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors" title="Zoom Out">
                <ZoomOut size={14} />
              </button>
              <button onClick={() => setViewFontSize(Math.min(24, viewFontSize + 1))} className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors border-l border-zinc-800" title="Zoom In">
                <ZoomIn size={14} />
              </button>
            </div>
         </div>
      </div>

      {/* ===================================================================== */}
      {/* AREA MEMORY HEX DUMP                                                  */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-[#0d0d0d]">
         <div className="font-mono flex flex-col gap-1 w-max min-w-full" style={{ fontSize: `${viewFontSize}px` }}>
            {memoryDump.length === 0 ? (
              <div className="text-zinc-600 text-sm text-center mt-10">Memory is empty or not initialized.</div>
            ) : (
              memoryDump.map((row, idx) => (
                <div key={idx} className="flex items-center gap-6 hover:bg-zinc-800/40 px-2 py-1 rounded transition-colors group">
                   <span className="text-emerald-500 font-semibold select-none group-hover:text-emerald-400 transition-colors">
                     0x{row.address}
                   </span>
                   <div className="flex gap-4 text-zinc-300">
                     {row.words.map((word: string, wIdx: number) => (
                       <span key={wIdx} className="hover:text-white cursor-text transition-colors">
                         {word}
                       </span>
                     ))}
                   </div>
                   <span className="text-zinc-500 tracking-widest bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/50 select-none hidden sm:block">
                     {row.ascii}
                   </span>
                </div>
              ))
            )}
         </div>
      </div>
    </div>
  );
}