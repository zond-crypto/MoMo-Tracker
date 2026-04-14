import { useState, useEffect, useMemo } from "react";
import { Plus, Home, List, PieChart, Trash2, ArrowDownToLine, ArrowUpFromLine, Wifi, Send, DollarSign, XCircle, RefreshCw, CheckSquare, Square, Sparkles, Receipt, TrendingUp, LogOut, Calculator, AlertTriangle, Lightbulb, TrendingDown, Activity, BarChart3, Lock, Unlock } from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, getDocFromServer } from "firebase/firestore";
import { calculateTx, CalcNetwork, CalcTxType } from "./calculatorLogic";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import AIAdvisor from './AIAdvisor';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string; operationType: OperationType; path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const NETWORKS: Record<string, any> = {
  MTN: { color: "bg-yellow-500", text: "text-yellow-500", border: "border-yellow-500", label: "MTN MoMo" },
  AIRTEL: { color: "bg-red-500", text: "text-red-500", border: "border-red-500", label: "Airtel Money" },
  ZAMTEL: { color: "bg-green-500", text: "text-green-500", border: "border-green-500", label: "Zamtel Kwacha" },
};

const TX_TYPES: Record<string, any> = {
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

type NetworkType = keyof typeof NETWORKS;

interface Transaction {
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

function fmt(n: number | string) {
  return `K ${parseFloat((n || 0).toString()).toFixed(2)}`;
}

function now() {
  return new Date().toLocaleTimeString("en-ZM", { hour: "2-digit", minute: "2-digit" });
}

function todayStr() {
  return new Date().toLocaleDateString("en-ZM", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function App() {
  const [screen, setScreen] = useState<"home" | "log" | "ledger" | "summary" | "calc" | "ai">("home");
  const [network, setNetwork] = useState<NetworkType>("MTN");
  const [openingFloat, setOpeningFloat] = useState("");
  const [floatSet, setFloatSet] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [form, setForm] = useState<{ type: string; amount: string; note: string; reference: string }>({
    type: "WITHDRAWAL", amount: "", note: "", reference: ""
  });
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [levyRate, setLevyRate] = useState<number>(0.0004);

  // Security & UX State
  const [pin, setPin] = useState(localStorage.getItem('momo_pin') || '');
  const [isLocked, setIsLocked] = useState(!!localStorage.getItem('momo_pin'));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Calculator State
  const [calcNetwork, setCalcNetwork] = useState<CalcNetwork>("MTN");
  const [calcType, setCalcType] = useState<CalcTxType>("WITHDRAWAL");
  const [calcAmount, setCalcAmount] = useState<string>("");
  const [bulkCount, setBulkCount] = useState<number>(1);

  // Offline-First Load
  useEffect(() => {
    const cached = localStorage.getItem('momo_data');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.openingFloat) setOpeningFloat(parsed.openingFloat);
        if (parsed.floatSet !== undefined) setFloatSet(parsed.floatSet);
        if (parsed.history) setHistory(parsed.history);
        if (parsed.levyRate !== undefined) setLevyRate(parsed.levyRate);
        if (parsed.lastNetwork) setNetwork(parsed.lastNetwork);
        if (parsed.lastTxType) setForm(prev => ({ ...prev, type: parsed.lastTxType }));
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, "users", currentUser.uid);
          try { await getDocFromServer(docRef); } catch (error) {
            if(error instanceof Error && error.message.includes('the client is offline')) {
              console.error("Please check your Firebase configuration. ");
            }
          }
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.transactions) setTransactions(data.transactions);
            if (data.openingFloat) setOpeningFloat(data.openingFloat);
            if (data.floatSet !== undefined) setFloatSet(data.floatSet);
            if (data.history) setHistory(data.history);
            if (data.levyRate !== undefined) setLevyRate(data.levyRate);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        } finally {
          setDataLoaded(true);
          setLoadingAuth(false);
        }
      } else {
        setDataLoaded(false);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (dataLoaded) {
      const dataToSave = { transactions, openingFloat, floatSet, history, levyRate, lastNetwork: network, lastTxType: form.type };
      localStorage.setItem('momo_data', JSON.stringify(dataToSave));
      
      if (user) {
        const saveData = async () => {
          try {
            await setDoc(doc(db, "users", user.uid), dataToSave, { merge: true });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
          }
        };
        saveData();
      }
    }
  }, [transactions, openingFloat, floatSet, history, levyRate, network, form.type, user, dataLoaded]);

  const net = NETWORKS[network];

  const balance = transactions.reduce((sum, tx) => {
    return sum + (TX_TYPES[tx.type]?.sign || 0) * tx.amount;
  }, floatSet ? parseFloat(openingFloat) : 0);

  const totalCommissions = transactions.reduce((sum, tx) => sum + (tx.commission || 0), 0);
  const totalFees = transactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  const totalLevy = transactions.reduce((sum, tx) => sum + (tx.levy || 0), 0);
  
  // Legacy support for older manual FEE_EARNED / EXPENSE
  const legacyCommissions = transactions.filter(t => t.type === "FEE_EARNED").reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const legacyFeesPaid = transactions.filter(t => t.type === "FEE_PAID").reduce((s, t) => s + t.amount, 0);
  
  const todayProfit = totalCommissions + legacyCommissions - expenses - legacyFeesPaid;
  const txCount = transactions.length;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function handleAddTx() {
    if (!form.amount || isNaN(Number(form.amount))) return showToast("Enter a valid amount");
    
    const amt = parseFloat(form.amount);
    let fee = 0, commission = 0, levy = 0;
    
    if (form.type !== 'EXPENSE' && form.type !== 'CASH_IN' && form.type !== 'CASH_OUT' && form.type !== 'FEE_EARNED' && form.type !== 'FEE_PAID') {
      const calc = calculateTx(network as CalcNetwork, form.type as CalcTxType, amt, levyRate);
      fee = calc.fee;
      commission = calc.commission;
      levy = calc.levy;
    }

    const newTx: Transaction = {
      id: Date.now(),
      type: form.type,
      amount: amt,
      fee,
      commission,
      levy,
      note: form.note,
      reference: form.reference,
      time: now(),
      timestamp: Date.now(),
      network,
    };
    if (editingId) {
      setTransactions(transactions.map(t => t.id === editingId ? { ...newTx, id: editingId, time: t.time, timestamp: t.timestamp } : t));
      setEditingId(null);
      showToast("Transaction updated");
    } else {
      setTransactions([newTx, ...transactions]);
      showToast("Transaction logged");
    }
    setForm({ ...form, amount: "", note: "", reference: "" });
    setScreen("home");
  }

  function editTx(tx: Transaction) {
    setForm({
      type: tx.type,
      amount: tx.amount.toString(),
      note: tx.note,
      reference: tx.reference
    });
    setNetwork(tx.network);
    setEditingId(tx.id);
    setScreen("log");
  }

  function deleteTx(id: number) {
    if (confirm("Delete this transaction?")) {
      setTransactions(transactions.filter(t => t.id !== id));
      showToast("Transaction deleted");
    }
  }

  function resetDay() {
    if (confirm("Close today's books and start a new day?")) {
      if (transactions.length > 0) {
        const dayStats = {
          id: Date.now(),
          date: new Date().toISOString(),
          profit: todayProfit,
          txCount,
          commissions: totalCommissions,
          fees: totalFees
        };
        setHistory([...history, dayStats]);
      }
      setTransactions([]);
      setOpeningFloat("");
      setFloatSet(false);
      setScreen("home");
      showToast("New day started");
    }
  }

  function clearAllData() {
    if (confirm("DANGER: This will permanently delete ALL your transactions and history. This cannot be undone. Are you sure?")) {
      setTransactions([]);
      setHistory([]);
      setOpeningFloat("");
      setFloatSet(false);
      setPin('');
      localStorage.removeItem('momo_pin');
      localStorage.removeItem('momo_data');
      showToast("Account reset successfully");
    }
  }

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error("Sign in error:", error);
        alert("Failed to sign in: " + error.message);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Smart Insights Logic
  const insights = useMemo(() => {
    const msgs = [];
    const smallWithdrawals = transactions.filter(t => t.type === 'WITHDRAWAL' && t.amount < 100);
    if (smallWithdrawals.length > 3) {
      const lost = smallWithdrawals.length * 2.5; // Example lost potential
      msgs.push({ type: 'warning', text: `You processed ${smallWithdrawals.length} small withdrawals today. Try combining them to save on fees.` });
    }

    const networkCommissions = transactions.reduce((acc, tx) => {
      if (tx.commission) {
        acc[tx.network] = (acc[tx.network] || 0) + tx.commission;
      }
      return acc;
    }, {} as Record<string, number>);

    const bestNetwork = Object.entries(networkCommissions).sort((a, b) => b[1] - a[1])[0];
    if (bestNetwork && bestNetwork[1] > 0) {
      msgs.push({ type: 'success', text: `${bestNetwork[0]} is your most profitable network today (K${bestNetwork[1].toFixed(2)} earned).` });
    }

    const typeCommissions = transactions.reduce((acc, tx) => {
      if (tx.commission) {
        acc[tx.type] = (acc[tx.type] || 0) + tx.commission;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const bestType = Object.entries(typeCommissions).sort((a, b) => b[1] - a[1])[0];
    if (bestType && bestType[1] > 0) {
      msgs.push({ type: 'info', text: `${TX_TYPES[bestType[0]]?.label || bestType[0]} is generating the most commission.` });
    }

    if (totalFees > 50) {
      msgs.push({ type: 'warning', text: `You have spent K${totalFees.toFixed(2)} on fees today. Consider using Zamtel for lower withdrawal rates.` });
    }

    return msgs;
  }, [transactions, totalFees]);

  // Chart Data
  const chartData = useMemo(() => {
    const grouped = transactions.reduce((acc, tx) => {
      if (tx.commission > 0) {
        const label = TX_TYPES[tx.type]?.label || tx.type;
        acc[label] = (acc[label] || 0) + tx.commission;
      }
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(grouped).map(k => ({ name: k, amount: grouped[k] }));
  }, [transactions]);

  const historyChartData = useMemo(() => {
    return history.slice(-7).map(h => ({
      name: new Date(h.date).toLocaleDateString('en-ZM', { weekday: 'short' }),
      profit: h.profit
    }));
  }, [history]);

  if (loadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans">
        <div className="w-16 h-16 bg-indigo-500/20 text-indigo-500 rounded-2xl flex items-center justify-center mb-6">
          <Activity size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-200 mb-2">Agent Intelligence</h1>
        <p className="text-slate-400 mb-8 max-w-xs">Enterprise dashboard for mobile money agents. Track, analyze, and optimize your profits offline & online.</p>
        <button onClick={handleSignIn} disabled={isSigningIn} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center gap-3 hover:bg-slate-100 transition-colors disabled:opacity-50">
          {isSigningIn ? <RefreshCw className="w-5 h-5 animate-spin text-slate-500" /> : <Sparkles className="w-5 h-5 text-indigo-500" />}
          {isSigningIn ? "Signing in..." : "Sign in to Dashboard"}
        </button>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans">
        <div className="w-16 h-16 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mb-6">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-200 mb-2">App Locked</h1>
        <p className="text-slate-400 mb-8 max-w-xs">Enter your PIN to access your financial data.</p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <input
            type="password"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
            }}
            placeholder="Enter PIN"
            className={`bg-slate-900 border ${pinError ? 'border-red-500' : 'border-slate-800'} rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest text-slate-200 outline-none focus:border-indigo-500`}
            maxLength={4}
          />
          <button 
            onClick={() => {
              if (pinInput === pin) {
                setIsLocked(false);
                setPinInput('');
              } else {
                setPinError(true);
                setPinInput('');
              }
            }}
            className="bg-indigo-500 text-white py-3 rounded-xl font-bold hover:bg-indigo-600 transition-colors"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans max-w-md mx-auto relative overflow-x-hidden pb-24">
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-600 text-white px-4 py-2 rounded-full text-sm z-50 whitespace-nowrap animate-in slide-in-from-bottom-4 fade-in duration-200 shadow-xl">
          {toast}
        </div>
      )}

      <div className="p-5 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800 sticky top-0 z-10">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-sans text-xl font-bold tracking-tight flex items-center gap-2">
              <span className={net.text}>●</span> Agent Dashboard
            </div>
            <div className="text-xs text-slate-400 mt-1">{todayStr()}</div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <button onClick={() => {
              if (pin) {
                if (confirm("Remove PIN lock?")) {
                  setPin('');
                  localStorage.removeItem('momo_pin');
                  showToast("PIN removed");
                }
              } else {
                const newPin = prompt("Enter a 4-digit PIN to lock your app:");
                if (newPin && newPin.length >= 4) {
                  setPin(newPin);
                  localStorage.setItem('momo_pin', newPin);
                  showToast("PIN set successfully");
                }
              }
            }} className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs transition-colors">
              {pin ? <Lock size={12} /> : <Unlock size={12} />} {pin ? "Remove PIN" : "Set PIN"}
            </button>
            <button onClick={resetDay} className="flex items-center gap-1 bg-slate-800 text-slate-400 px-3 py-1.5 rounded-full text-xs border border-slate-700 hover:bg-slate-700 transition-colors">
              <RefreshCw size={12} /> Close Day
            </button>
            <button onClick={() => signOut(auth)} className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs transition-colors">
              <LogOut size={12} /> Sign Out
            </button>
            <button onClick={clearAllData} className="flex items-center gap-1 text-red-500 hover:text-red-400 text-[10px] mt-1 transition-colors">
              <Trash2 size={10} /> Reset Account
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {Object.keys(NETWORKS).map((n) => (
            <button
              key={n}
              onClick={() => setNetwork(n as NetworkType)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${network === n ? `${NETWORKS[n].color} text-slate-950 shadow-sm` : "text-slate-500 hover:text-slate-300"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* HOME SCREEN */}
        {screen === "home" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {!floatSet ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h2 className="text-sm font-bold text-slate-200 mb-3">Set Opening Float</h2>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    placeholder="Enter amount..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={() => { if (openingFloat) setFloatSet(true); }}
                    className="bg-indigo-500 text-white px-6 rounded-xl font-bold hover:bg-indigo-600 transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
            ) : (
              <div className={`bg-gradient-to-br from-slate-900 to-slate-950 border ${net.border} rounded-2xl p-6 relative overflow-hidden shadow-lg`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
                <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Current Float</div>
                <div className={`font-mono text-4xl font-bold tracking-tight ${balance >= parseFloat(openingFloat) ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(balance)}
                </div>
                <div className="mt-4 flex justify-between items-center text-xs border-t border-slate-800/50 pt-4">
                  <div className="text-slate-400">Opening: <span className="text-slate-200 font-mono">{fmt(openingFloat)}</span></div>
                  <div className="text-slate-400">Profit: <span className="text-green-400 font-mono">+{fmt(todayProfit)}</span></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Activity size={20} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Transactions</div>
                  <div className="text-lg font-bold">{txCount}</div>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                  <DollarSign size={20} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Commission</div>
                  <div className="text-lg font-bold">{fmt(totalCommissions)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-300">Recent Activity</h3>
                <button onClick={() => setScreen("ledger")} className="text-xs text-indigo-400 hover:text-indigo-300">View All</button>
              </div>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm bg-slate-900/50 rounded-2xl border border-slate-800/50">No transactions yet</div>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 4).map(tx => (
                    <TxRow key={tx.id} tx={tx} onDelete={deleteTx} onEdit={editTx} netColor={NETWORKS[tx.network]?.text} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LOG TX SCREEN */}
        {screen === "log" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.keys(TX_TYPES).filter(k => k !== 'CASH_IN' && k !== 'CASH_OUT' && k !== 'TRANSFER' && k !== 'FEE_EARNED' && k !== 'FEE_PAID').map(k => {
                const t = TX_TYPES[k];
                const Icon = t.icon;
                return (
                  <button
                    key={k}
                    onClick={() => setForm({ ...form, type: k })}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${form.type === k ? `bg-slate-800 border-${t.color.split('-')[1]}-500/50 shadow-sm` : "bg-slate-900 border-slate-800 hover:bg-slate-800/50"}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.bg} ${t.color}`}><Icon size={16} /></div>
                    <span className="text-xs font-bold text-slate-200">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Amount (ZMW)</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xl font-bold text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>
              
              {/* Auto-Calculation Preview */}
              {form.amount && !isNaN(Number(form.amount)) && form.type !== 'EXPENSE' && (
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
                  {(() => {
                    const calc = calculateTx(network as CalcNetwork, form.type as CalcTxType, parseFloat(form.amount), levyRate);
                    return (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Est. Fee:</span>
                          <span className="text-red-400 font-mono">K{calc.fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Est. Commission:</span>
                          <span className="text-green-400 font-mono font-bold">+K{calc.commission.toFixed(2)}</span>
                        </div>
                        {calc.fee > 20 && (
                          <div className="mt-2 text-[10px] text-rose-400 flex items-center gap-1">
                            <AlertTriangle size={12} /> High fee detected. Consider splitting.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Reference (Opt)</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="#12345"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Note (Opt)</label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddTx}
                className={`flex-1 ${net.color} text-slate-950 py-4 rounded-xl font-bold text-sm tracking-wide transition-transform active:scale-95 shadow-lg`}
              >
                {editingId ? "UPDATE TRANSACTION" : "RECORD & CALCULATE"}
              </button>
              <button
                onClick={() => {
                  setForm({ type: "WITHDRAWAL", amount: "", note: "", reference: "" });
                  setEditingId(null);
                }}
                className="bg-slate-800 text-slate-400 px-4 rounded-xl hover:bg-slate-700 transition-colors"
                title="Reset Form"
              >
                <RefreshCw size={20} />
              </button>
            </div>
            {editingId && (
              <button onClick={() => { setEditingId(null); setScreen("home"); }} className="w-full text-xs text-slate-500 hover:text-slate-300 mt-2">
                Cancel Editing
              </button>
            )}
          </div>
        )}

        {/* LEDGER SCREEN */}
        {screen === "ledger" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="font-sans text-xl font-bold mb-1 flex items-center gap-2">
              <List className={net.text} /> Transaction Ledger
            </div>
            <div className="text-xs text-slate-400 mb-4">{transactions.length} entries today</div>

            {transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No transactions recorded</div>
            ) : (
              <div className="space-y-2">
                {transactions.map(tx => (
                  <TxRow key={tx.id} tx={tx} onDelete={deleteTx} onEdit={editTx} netColor={NETWORKS[tx.network]?.text || net.text} full />
                ))}
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD / SUMMARY SCREEN */}
        {screen === "summary" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            <div className="font-sans text-xl font-bold flex items-center gap-2">
              <BarChart3 className="text-indigo-400" /> Intelligence Dashboard
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/30 rounded-2xl p-4">
                <div className="text-[10px] text-indigo-300 uppercase tracking-wider mb-1">Net Profit Today</div>
                <div className={`text-2xl font-bold ${todayProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {todayProfit >= 0 ? '+' : ''}{fmt(todayProfit)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Loss Tracker (Fees)</div>
                <div className="text-xl font-bold text-rose-400">
                  {fmt(totalFees + legacyFeesPaid)}
                </div>
              </div>
            </div>

            {/* Smart Insights Engine */}
            {insights.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Lightbulb size={16} className="text-yellow-500" /> Smart Insights
                </h3>
                {insights.map((insight, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    insight.type === 'warning' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                    insight.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                    'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  }`}>
                    {insight.type === 'warning' ? <TrendingDown size={14} className="shrink-0 mt-0.5" /> : 
                     insight.type === 'success' ? <TrendingUp size={14} className="shrink-0 mt-0.5" /> : 
                     <Activity size={14} className="shrink-0 mt-0.5" />}
                    <p>{insight.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Charts */}
            {chartData.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-4">Commission by Type</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{fill: '#1e293b'}}
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#ec4899'][index % 4]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {historyChartData.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-4">7-Day Profit Trend</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Detailed Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-3 border-b border-slate-800 bg-slate-800/50">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider">Financial Breakdown</h3>
              </div>
              <div className="divide-y divide-slate-800">
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm text-slate-300">Total Commissions</span>
                  <span className="text-sm font-bold text-green-400">{fmt(totalCommissions + legacyCommissions)}</span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm text-slate-300">Total Fees Processed</span>
                  <span className="text-sm font-bold text-rose-400">{fmt(totalFees + legacyFeesPaid)}</span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm text-slate-300">Total Gov Levy</span>
                  <span className="text-sm font-bold text-rose-400">{fmt(totalLevy)}</span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm text-slate-300">Shop Expenses</span>
                  <span className="text-sm font-bold text-rose-400">{fmt(expenses)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CALCULATOR SCREEN */}
        {screen === "calc" && (
          <div className="space-y-4 animate-in fade-in duration-300 pt-4">
            <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Calculator className="text-indigo-400" /> Fee Calculator
            </h2>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Network</label>
                <div className="grid grid-cols-3 gap-2">
                  {["MTN", "AIRTEL", "ZAMTEL"].map(n => (
                    <button key={n} onClick={() => setCalcNetwork(n as CalcNetwork)} className={`py-2 rounded-xl text-xs font-bold transition-colors ${calcNetwork === n ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Transaction Type</label>
                <select value={calcType} onChange={(e) => setCalcType(e.target.value as CalcTxType)} className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500">
                  <option value="DEPOSIT">Deposit</option>
                  <option value="WITHDRAWAL">Withdrawal</option>
                  <option value="SEND">Send Money</option>
                  <option value="AIRTIME">Airtime Purchase</option>
                  <option value="BILLS">Bill Payment</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Amount (ZMW)</label>
                <input type="number" value={calcAmount} onChange={(e) => setCalcAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xl font-bold text-slate-200 outline-none focus:border-indigo-500" />
              </div>

              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                  <span>Bulk Simulator</span>
                  <span className="text-indigo-400">{bulkCount}x Transactions</span>
                </label>
                <input type="range" min="1" max="20" step="1" value={bulkCount} onChange={(e) => setBulkCount(parseInt(e.target.value))} className="w-full accent-indigo-500" />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Gov Levy Rate</span>
                  <span>{(levyRate * 100).toFixed(2)}%</span>
                </label>
                <input type="range" min="0" max="0.005" step="0.0001" value={levyRate} onChange={(e) => setLevyRate(parseFloat(e.target.value))} className="w-full accent-indigo-500" />
              </div>
            </div>
            
            {(() => {
              const amt = parseFloat(calcAmount) || 0;
              const single = calculateTx(calcNetwork, calcType, amt, levyRate);
              const combined = calculateTx(calcNetwork, calcType, amt * bulkCount, levyRate);
              
              const totalSeparateFee = single.fee * bulkCount;
              const totalSeparateComm = single.commission * bulkCount;
              
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total Fee ({bulkCount}x)</div>
                      <div className="text-xl font-bold text-red-400">K{totalSeparateFee.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total Earns ({bulkCount}x)</div>
                      <div className="text-xl font-bold text-green-400">K{totalSeparateComm.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  {bulkCount > 1 && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-indigo-400 mb-2">Bulk vs Combined Analysis</div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Fee if done separately ({bulkCount}x K{amt})</span>
                        <span className="text-red-400 font-mono">K{totalSeparateFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Fee if combined (1x K{amt * bulkCount})</span>
                        <span className="text-green-400 font-mono">K{combined.fee.toFixed(2)}</span>
                      </div>
                      <div className="h-px bg-indigo-500/20 my-2"></div>
                      <div className="flex justify-between font-bold text-sm">
                        <span className="text-slate-300">Potential Savings</span>
                        <span className="text-indigo-400 font-mono">K{(totalSeparateFee - combined.fee).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Transaction Amount</span>
                      <span className="text-slate-200 font-mono">K{amt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Gov Levy</span>
                      <span className="text-red-400 font-mono">K{levy.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-slate-800 my-2"></div>
                    <div className="flex justify-between font-bold">
                      <span className="text-slate-300">Total Deduction</span>
                      <span className="text-rose-500 font-mono">K{totalDeduction.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-slate-300">Net Received</span>
                      <span className="text-green-400 font-mono">K{net.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* AI ADVISOR SCREEN */}
        {screen === "ai" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pt-2">
            <AIAdvisor contextData={{
              transactions,
              history,
              todayProfit,
              totalCommissions,
              totalFees,
              totalLevy,
              balance,
              openingFloat,
              network
            }} />
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-2 pb-safe z-40">
        <div className="flex justify-around items-center">
          {[
            { key: "home", icon: Home, label: "Home" },
            { key: "summary", icon: BarChart3, label: "Stats" },
            { key: "log", icon: Plus, label: "Log TX", primary: true },
            { key: "ai", icon: Sparkles, label: "AI" },
            { key: "calc", icon: Calculator, label: "Calc" },
          ].map(btn => {
            const Icon = btn.icon;
            const isActive = screen === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setScreen(btn.key as any)}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${
                  btn.primary
                    ? `${net.color} text-slate-950 shadow-lg -translate-y-2 w-16`
                    : isActive
                    ? `${net.text} bg-slate-900`
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon size={btn.primary ? 24 : 20} strokeWidth={btn.primary ? 2.5 : 2} />
                <span className={`text-[9px] mt-1 font-medium ${btn.primary ? "font-bold" : ""}`}>{btn.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx, onDelete, onEdit, netColor, full }: { tx: Transaction; onDelete: (id: number) => void; onEdit: (tx: Transaction) => void; netColor: string; full?: boolean }) {
  const txDef = TX_TYPES[tx.type] || { label: tx.type, icon: Send, color: "text-slate-500", bg: "bg-slate-500/10", sign: -1 };
  const Icon = txDef.icon;
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
