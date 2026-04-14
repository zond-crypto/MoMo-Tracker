import { Trash2, Plus, Send } from "lucide-react";
import { Transaction } from "./types";
import { TX_TYPES } from "./constants";

interface TxRowProps {
  tx: Transaction;
  onDelete: (id: number) => void;
  onEdit: (tx: Transaction) => void;
  netColor: string;
  full?: boolean;
}

export function TxRow({ tx, onDelete, onEdit, netColor, full }: TxRowProps) {
  const txDef = TX_TYPES[tx.type] || { label: tx.type, icon: Send, color: "text-slate-500", bg: "bg-slate-500/10", sign: -1 };
  const Icon = txDef.icon;

  const fmt = (n: number | string) => {
    return `K ${parseFloat((n || 0).toString()).toFixed(2)}`;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800/50 transition-colors group">
      <div className={`w-10 h-10 rounded-lg shrink-0 flex items-center justify-center ${txDef.bg} ${txDef.color}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-200">{txDef.label}</div>
        {(tx.reference || (full && tx.note)) && (
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {tx.reference && <span className="font-mono">#{tx.reference}</span>}
            {tx.reference && full && tx.note && " | "}
            {full && tx.note && (tx.note.length > 40 ? `${tx.note.substring(0, 40)}...` : tx.note)}
          </div>
        )}
        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
          {tx.time} <span className="text-slate-700">•</span> <span className={netColor}>{tx.network}</span>
        </div>
        {full && tx.commission > 0 && (
          <div className="text-[10px] text-green-400 mt-1 font-medium bg-green-500/10 inline-block px-1.5 py-0.5 rounded">
            +K{tx.commission.toFixed(2)} commission
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`text-sm font-bold ${txDef.color}`}>
          {txDef.sign > 0 ? "+" : "−"}{fmt(tx.amount)}
        </div>
        {full && (
          <div className="flex flex-col gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity items-end">
            <button
              onClick={() => onEdit(tx)}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center justify-end gap-1 w-full"
            >
              <Plus size={10} className="rotate-45" /> edit
            </button>
            <button
              onClick={() => onDelete(tx.id)}
              className="text-[10px] text-slate-500 hover:text-red-400 flex items-center justify-end gap-1 w-full"
            >
              <Trash2 size={10} /> remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
