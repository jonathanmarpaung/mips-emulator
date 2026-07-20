import React from 'react';
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

interface DisassemblyViewProps {
  disassembly: any[];
  activePC: number;
  addressBreakpoints: Set<number>;
  toggleBreakpoint: (addr: number) => void;
  viewFontSize: number;
  setViewFontSize: (val: number) => void;
}

export function DisassemblyView({ disassembly, activePC, addressBreakpoints, toggleBreakpoint, viewFontSize, setViewFontSize }: DisassemblyViewProps) {
  return (
    <div className="flex-1 m-0 flex flex-col bg-[#0d0d0d] overflow-hidden min-h-0 w-full h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-900 bg-zinc-950 shrink-0">
        <span className="text-[11px] text-zinc-500 hidden sm:inline">Click a row to set a breakpoint.</span>
        <span className="text-[11px] text-zinc-500 sm:hidden">Tap row for breakpoint.</span>
        <div className="flex items-center gap-1 bg-zinc-900 rounded border border-zinc-800 p-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400" onClick={() => setViewFontSize(Math.max(10, viewFontSize - 1))}><ZoomOut className="w-3 h-3"/></Button>
          <span className="text-[10px] text-zinc-400 font-mono w-6 text-center">{viewFontSize}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400" onClick={() => setViewFontSize(Math.min(24, viewFontSize + 1))}><ZoomIn className="w-3 h-3"/></Button>
        </div>
      </div>
      {/* PENTING: overflow-y-auto agar bisa di scroll */}
      <div className="flex-1 overflow-y-auto relative min-h-0 w-full">
        <table className="w-full text-left border-collapse min-w-[300px]">
          <thead className="sticky top-0 bg-[#09090b]/95 backdrop-blur z-10 border-b border-zinc-900">
            <tr>
              <th className="px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-zinc-500 uppercase tracking-widest w-24 md:w-32">Address</th>
              <th className="px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-zinc-500 uppercase tracking-widest w-24 md:w-28 border-l border-zinc-900">Opcode</th>
              <th className="px-3 py-1.5 text-[10px] md:text-[11px] font-semibold text-zinc-500 uppercase tracking-widest border-l border-zinc-900">Instruction</th>
            </tr>
          </thead>
          <tbody className="font-mono" style={{ fontSize: `${viewFontSize}px` }}>
            {disassembly.length === 0 ? (
               <tr><td colSpan={3} className="p-8 text-center text-zinc-700 text-xs">Awaiting Compilation...</td></tr>
            ) : (
              disassembly.map((row, idx) => {
                const isActive = row.address === activePC;
                const isBp = addressBreakpoints.has(row.address);
                return (
                  <tr key={idx} onClick={() => toggleBreakpoint(row.address)} className={`${isActive ? 'bg-emerald-900/20 text-emerald-400' : 'hover:bg-zinc-900/50 text-zinc-400'} border-b border-zinc-900/50 cursor-pointer`}>
                    <td className="px-3 py-2 md:py-1.5 flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 md:mr-3 flex-shrink-0 ${isBp ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-transparent'}`}></div>
                      {row.addressHex}
                    </td>
                    <td className="px-3 py-2 md:py-1.5 text-zinc-600 border-l border-zinc-900/50">{row.opcode}</td>
                    <td className="px-3 py-2 md:py-1.5 border-l border-zinc-900/50 whitespace-pre">{row.instruction}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
