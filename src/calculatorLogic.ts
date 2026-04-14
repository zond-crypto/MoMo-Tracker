export type CalcNetwork = 'MTN' | 'AIRTEL' | 'ZAMTEL';
export type CalcTxType = 'DEPOSIT' | 'WITHDRAWAL' | 'SEND' | 'AIRTIME' | 'BILLS';

interface Tier { min: number; max: number; fee: number; }

const TIERS = {
  MTN: {
    SEND: [
      { min: 0, max: 150, fee: 0 },
      { min: 151, max: 1000, fee: 2 },
      { min: 1001, max: Infinity, fee: 5 }
    ],
    WITHDRAWAL: [
      { min: 0, max: 100, fee: 2.5 },
      { min: 101, max: 500, fee: 5 },
      { min: 501, max: 1000, fee: 10 },
      { min: 1001, max: 3000, fee: 20 },
      { min: 3001, max: Infinity, fee: 70 }
    ]
  },
  AIRTEL: {
    SEND: [
      { min: 0, max: 150, fee: 0.5 },
      { min: 151, max: 1000, fee: 2 },
      { min: 1001, max: Infinity, fee: 5.5 }
    ],
    WITHDRAWAL: [
      { min: 0, max: 100, fee: 2.5 },
      { min: 101, max: 500, fee: 5 },
      { min: 501, max: 1000, fee: 10 },
      { min: 1001, max: 3000, fee: 20 },
      { min: 3001, max: Infinity, fee: 60 }
    ]
  },
  ZAMTEL: {
    SEND: [
      { min: 0, max: 150, fee: 0.5 },
      { min: 151, max: 1000, fee: 1.5 },
      { min: 1001, max: Infinity, fee: 4 }
    ],
    WITHDRAWAL: [
      { min: 0, max: 100, fee: 2 },
      { min: 101, max: 500, fee: 4 },
      { min: 501, max: 1000, fee: 8 },
      { min: 1001, max: 3000, fee: 15 },
      { min: 3001, max: Infinity, fee: 50 }
    ]
  }
};

function getFee(network: CalcNetwork, type: CalcTxType, amount: number): number {
  if (type === 'DEPOSIT' || type === 'AIRTIME' || type === 'BILLS') return 0; // Usually free for user to deposit/buy airtime
  const tiers = TIERS[network][type as 'SEND' | 'WITHDRAWAL'];
  if (!tiers) return 0;
  const tier = tiers.find(t => amount >= t.min && amount <= t.max);
  return tier ? tier.fee : 0;
}

function getCommission(network: CalcNetwork, type: CalcTxType, amount: number, fee: number): number {
  switch (type) {
    case 'DEPOSIT':
      return amount * 0.005; // ~0.5%
    case 'WITHDRAWAL':
      return network === 'ZAMTEL' ? fee * 0.7 : fee * 0.2; // 70% for Zamtel, 20% for others
    case 'AIRTIME':
      return network === 'ZAMTEL' ? amount * 0.12 : amount * 0.05; // 12% Zamtel, 5% others
    case 'BILLS':
      return network === 'ZAMTEL' ? amount * 0.08 : amount * 0.03; // 8% Zamtel, 3% others
    case 'SEND':
      return 0; // Usually no commission for sending
    default:
      return 0;
  }
}

export function calculateTx(network: CalcNetwork, type: CalcTxType, amount: number, levyRate: number) {
  if (!amount || amount < 0) return { fee: 0, commission: 0, levy: 0, totalDeduction: 0, net: 0 };
  
  const fee = getFee(network, type, amount);
  const commission = getCommission(network, type, amount, fee);
  const levy = amount * levyRate;
  
  // Total deduction for the user (amount + fee + levy)
  const totalDeduction = amount + fee + levy;
  
  // Net amount received by the recipient (for send/withdraw)
  const net = amount; 

  return {
    fee,
    commission,
    levy,
    totalDeduction,
    net
  };
}
