import React from 'react';
import { Button } from "@/components/ui/button";
import { FolderCode, FileText, Plus } from "lucide-react";

export function Sidebar() {
  return (
    <div className="flex flex-col w-full h-full bg-[#09090b] text-zinc-300 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none h-[52px] flex items-center gap-3 px-5 border-b border-zinc-900 bg-[#09090b] shadow-sm z-10">
        <FolderCode className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Workspace</span>
      </div>

      {/* KONTEN SCROLL */}
      <div className="flex-1 overflow-y-auto overscroll-none min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="p-3 pb-24 space-y-1.5">
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/80 text-emerald-400 rounded-md cursor-pointer border border-zinc-800 shadow-sm transition-colors">
            <FileText className="w-3.5 h-3.5" /> <span className="text-sm font-mono">main.s</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/30 rounded-md cursor-not-allowed group transition-colors">
            <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> <span className="text-sm font-mono">utils.s</span></div>
            <span className="text-[9px] uppercase tracking-wider border border-zinc-800 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Soon</span>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-600 hover:text-zinc-300 h-9 mt-4" disabled>
            <Plus className="w-3.5 h-3.5" /> <span className="text-xs">New File (.include)</span>
          </Button>
        </div>
      </div>
    </div>
  );
}