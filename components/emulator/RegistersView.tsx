import React from 'react';

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

interface RegistersViewProps {
  regValues: Record<string, string>;
}

export function RegistersView({ regValues }: RegistersViewProps) {
  return (
    <div className="flex-1 flex flex-col bg-[#0d0d0d] overflow-hidden min-h-0 w-full h-full">
      <div className="flex-1 overflow-y-auto relative min-h-0 w-full p-3 md:p-6 pb-24" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-4xl mx-auto space-y-2">
          
          <div className="py-2 px-2 border-b border-zinc-800/80 mb-2 sticky top-0 bg-[#0d0d0d]/95 backdrop-blur z-10">
             <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Integer Registers (GPR)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {UI_GPR.map((reg) => (
              <div key={reg.id} className="flex justify-between items-center py-2 px-3 hover:bg-zinc-900/80 rounded-md transition-colors border border-transparent hover:border-zinc-800 cursor-default">
                <span className="font-mono text-xs text-zinc-500">{reg.name}</span>
                <span className="font-mono text-xs font-medium text-emerald-400 tracking-wider">{regValues[reg.id] || '00000000'}</span>
              </div>
            ))}
          </div>

          <div className="py-2 px-2 border-b border-zinc-800/80 mb-2 mt-8 sticky top-0 bg-[#0d0d0d]/95 backdrop-blur z-10">
             <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Floating Point (FPU)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {UI_FPR.map((reg) => (
              <div key={reg.id} className="flex justify-between items-center py-2 px-3 hover:bg-zinc-900/80 rounded-md transition-colors border border-transparent hover:border-zinc-800 cursor-default">
                <span className="font-mono text-xs text-zinc-500">{reg.name}</span>
                <span className="font-mono text-xs font-medium text-cyan-400 tracking-wider">{regValues[reg.id] || '0.0000'}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}