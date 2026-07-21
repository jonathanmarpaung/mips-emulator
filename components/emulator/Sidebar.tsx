import React from 'react';
import { Button } from "@/components/ui/button";
import { FolderCode, FileText, Plus } from "lucide-react";

interface SidebarProps {
  activeTab: 'files' | 'registers';
  setActiveTab: (tab: 'files' | 'registers') => void;
  regValues: Record<string, string>;
}

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

export function Sidebar({ activeTab, setActiveTab, regValues }: SidebarProps) {
  return (
    <div className="flex flex-col h-full w-full bg-[#09090b] text-zinc-300 overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-900 shrink-0 shadow-sm z-10">
        <button onClick={() => setActiveTab('files')} className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'files' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Project</button>
        <button onClick={() => setActiveTab('registers')} className={`text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === 'registers' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>Registers</button>
      </div>
      
      {/* PERBAIKAN TOTAL: Menggunakan Native CSS Scroll agar dijamin tidak stuck di HP */}
      <div className="flex-1 overflow-y-auto overscroll-contain w-full min-h-0">
        {activeTab === 'files' ? (
          <div className="p-2 space-y-1 pb-24">
            <div className="flex items-center gap-2 px-2 py-1.5 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <FolderCode className="w-4 h-4"/> Workspace
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 text-emerald-400 rounded-md cursor-pointer border border-zinc-800 shadow-sm">
              <FileText className="w-3.5 h-3.5" /> <span className="text-xs font-mono">main.s</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 text-zinc-600 hover:text-zinc-400 cursor-not-allowed group">
              <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> <span className="text-xs font-mono">utils.s</span></div>
              <span className="text-[9px] uppercase tracking-wider border border-zinc-800 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Soon</span>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-2 text-zinc-600 hover:text-zinc-300 h-8 mt-2" disabled>
              <Plus className="w-3.5 h-3.5" /> <span className="text-xs">New File (.include)</span>
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-0.5 pb-24">
            <div className="py-1 px-2 border-b border-zinc-800/50 mb-1 mt-2">
               <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Integer (GPR)</span>
            </div>
            {UI_GPR.map((reg) => (
              <div key={reg.id} className="flex justify-between items-center py-1.5 px-2 hover:bg-zinc-900 rounded cursor-default">
                <span className="font-mono text-[11px] text-zinc-500">{reg.name}</span>
                <span className="font-mono text-[11px] text-emerald-500/90">{regValues[reg.id] || '00000000'}</span>
              </div>
            ))}
            <div className="py-1 px-2 border-b border-zinc-800/50 mb-1 mt-4">
               <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Float (FPU)</span>
            </div>
            {UI_FPR.map((reg) => (
              <div key={reg.id} className="flex justify-between items-center py-1.5 px-2 hover:bg-zinc-900 rounded cursor-default">
                <span className="font-mono text-[11px] text-zinc-500">{reg.name}</span>
                <span className="font-mono text-[11px] text-cyan-500/90">{regValues[reg.id] || '0.0000'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}