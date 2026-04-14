import { ArrowDownToLine, ArrowUpFromLine, Send, Wifi, Receipt, Trash2, DollarSign, XCircle } from "lucide-react";
import { TxTypeConfig } from "./types";

export const NETWORKS: Record<string, any> = {
  MTN: { color: "bg-yellow-500", text: "text-yellow-500", border: "border-yellow-500", label: "MTN MoMo" },
  AIRTEL: { color: "bg-red-500", text: "text-red-500", border: "border-red-500", label: "Airtel Money" },
  ZAMTEL: { color: "bg-green-500", text: "text-green-500", border: "border-green-500", label: "Zamtel Kwacha" },
};

export const TX_TYPES: Record<string, TxTypeConfig> = {
  DEPOSIT: { label: "Deposit (Cash In)", icon: ArrowDownToLine, color: "text-blue-500", bg: "bg-blue-500/10", sign: -1 },
  WITHDRAWAL: { label: "Withdrawal (Cash Out)", icon: ArrowUpFromLine, color: "text-purple-500", bg: "bg-purple-500/10", sign: 1 },
  SEND: { label: "Send Money", icon: Send, color: "text-orange-500", bg: "bg-orange-500/10", sign: -1 },
  AIRTIME: { label: "Airtime Sale", icon: Wifi, color: "text-sky-500", bg: "bg-sky-500/10", sign: -1 },
  BILLS: { label: "Bill Payment", icon: Receipt, color: "text-indigo-500", bg: "bg-indigo-500/10", sign: -1 },
  EXPENSE: { label: "Shop Expense", icon: Trash2, color: "text-rose-500", bg: "bg-rose-500/10", sign: 0 },
  // Legacy
  CASH_IN: { label: "Cash In (Deposit)", icon: ArrowDownToLine, color: "text-green-500", bg: "bg-green-500/10", sign: 1 },
  CASH_OUT: { label: "Cash Out (Withdraw)", icon: ArrowUpFromLine, color: "text-red-500", bg: "bg-red-500/10", sign: -1 },
  TRANSFER: { label: "Transfer Sent", icon: Send, color: "text-orange-500", bg: "bg-orange-500/10", sign: -1 },
  FEE_EARNED: { label: "Commission Earned", icon: DollarSign, color: "text-green-500", bg: "bg-green-500/10", sign: 1 },
  FEE_PAID: { label: "Fee Paid", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", sign: -1 },
};
