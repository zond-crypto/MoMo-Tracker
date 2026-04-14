import { LucideIcon } from "lucide-react";

export type NetworkType = "MTN" | "AIRTEL" | "ZAMTEL";

export interface Transaction {
  id: number;
  type: string;
  amount: number;
  fee: number;
  commission: number;
  levy: number;
  note: string;
  reference: string;
  time: string;
  timestamp: number;
  network: NetworkType;
}

export interface DayStats {
  id: number;
  date: string;
  profit: number;
  txCount: number;
  commissions: number;
  fees: number;
}

export interface TxTypeConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  sign: number;
}
