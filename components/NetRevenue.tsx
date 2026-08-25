import React, { useState, useMemo, useEffect } from 'react';
import { Order, BatchCost } from '../types';
import { TrendingUp, Download, Save, CheckCircle } from 'lucide-react';
import { upsertSummaryEntry, SummaryEntry } from '../services/storage';
import { DELIVERY_FEE_PER_ITEM, OAT_RATE } from '../constants';

interface NetRevenueProps {
  orders: Order[];
  batchCosts?: BatchCost[];
  onUpdateSummary?: (data: any) => void;
}

export const NetRevenue: React.FC<NetRevenueProps> = ({ orders, batchCosts = [], onUpdateSummary }) => {
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [startBatch, setStartBatch] = useState('');
  const [endBatch, setEndBatch] = useState('');
  const [salaryDeduction, setSalaryDeduction] = useState(50000);
  const [localDeliveryFee, setLocalDeliveryFee] = useState(0);
  const [otherExpense, setOtherExpense] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const FIXED_EXPENSE = 50000;

  // Get all unique batches
  const uniqueBatches = useMemo(() => {
    return Array.from(new Set(orders.map(o => o.batchName))).sort().reverse();
  }, [orders]);

  // Parse batch name to extract year and month
  const parseBatchName = (name: string) => {
    const regex = /^BATCH-(\d{4})(\d{2})-/;
    const match = name.match(regex);
    if (match) {
      return { year: match[1], month: match[2] };
    }
    return null;
  };

  // Get batches for selected month/year
  const batchesForMonth = useMemo(() => {
    return uniqueBatches.filter(batch => {
      const parsed = parseBatchName(batch);
      return parsed && parsed.year === selectedYear && parsed.month === selectedMonth;
    });
  }, [uniqueBatches, selectedYear, selectedMonth]);

  const batchesForMonthSorted = useMemo(() => {
    return [...batchesForMonth].sort();
  }, [batchesForMonth]);

  useEffect(() => {
    if (batchesForMonthSorted.length > 0) {
      setStartBatch(batchesForMonthSorted[0]);
      setEndBatch(batchesForMonthSorted[batchesForMonthSorted.length - 1]);
    } else {
      setStartBatch('');
      setEndBatch('');
    }
  }, [batchesForMonthSorted]);

  const selectedBatches = useMemo(() => {
    if (batchesForMonthSorted.length === 0) return [];
    const startIndex = startBatch ? batchesForMonthSorted.indexOf(startBatch) : 0;
    const endIndex = endBatch ? batchesForMonthSorted.indexOf(endBatch) : batchesForMonthSorted.length - 1;
    if (startIndex === -1 || endIndex === -1) return batchesForMonthSorted;
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    return batchesForMonthSorted.slice(from, to + 1);
  }, [batchesForMonthSorted, startBatch, endBatch]);

  // Calculate total sales for selected month
  const monthlyStats = useMemo(() => {
    const monthBatches = selectedBatches;
    let totalSales = 0;
    let totalItems = 0;
    let totalAdvance = 0;
    let totalRemaining = 0;

    orders.forEach(order => {
      if (monthBatches.includes(order.batchName)) {
        const itemTotal = order.sellingPrice * order.quantity;
        totalSales += itemTotal;
        totalItems += order.quantity;
        totalAdvance += order.advancePaid;
        
        if (!order.isFullPaymentReceived) {
          totalRemaining += Math.max(0, itemTotal - order.advancePaid);
        }
      }
    });

    return { totalSales, totalItems, totalAdvance, totalRemaining };
  }, [orders, selectedBatches]);

  const deductions = useMemo(() => {
    const batchCostMap = new Map(batchCosts.map(c => [c.batchName, c]));
    const allClosed = selectedBatches.length > 0 && selectedBatches.every(b => batchCostMap.has(b));

    let totalCostPrice = 0;
    let totalDelivery = 0;
    let totalOat = 0;

    selectedBatches.forEach(batchName => {
      const costConfig = batchCostMap.get(batchName);
      if (!costConfig) return;

      const batchOrders = orders.filter(o => o.batchName === batchName);
      const totalItems = batchOrders.reduce((acc, o) => acc + o.quantity, 0);
      const finalDeliveryQty = costConfig.deliveryFeeQuantity !== undefined ? costConfig.deliveryFeeQuantity : totalItems;
      const deliveryFee = finalDeliveryQty * DELIVERY_FEE_PER_ITEM;
      const oatPayment = (costConfig.oatInputValue || 0) * OAT_RATE;
      const costPrice = costConfig.totalCostPrice || 0;

      totalDelivery += deliveryFee;
      totalOat += oatPayment;
      totalCostPrice += costPrice;
    });

    return { allClosed, totalCostPrice, totalDelivery, totalOat };
  }, [batchCosts, selectedBatches, orders]);

  // Calculate net profit
  const profitCalculation = useMemo(() => {
    const sales = monthlyStats.totalSales;
    const cost = deductions.allClosed ? deductions.totalCostPrice : 0;
    const delivery = deductions.allClosed ? deductions.totalDelivery : 0;
    const oat = deductions.allClosed ? deductions.totalOat : 0;
    const otherLocalDelivery = localDeliveryFee;
    const otherExpenseValue = otherExpense;
    const salaryExpense = salaryDeduction;

    const totalDeductions = cost + delivery + oat + salaryExpense + otherLocalDelivery + otherExpenseValue;
    const netProfit = sales - totalDeductions;

    return { sales, cost, delivery, oat, salaryExpense, otherLocalDelivery, otherExpenseValue, totalDeductions, netProfit };
  }, [monthlyStats, deductions, salaryDeduction, localDeliveryFee, otherExpense]);

  const handleSaveData = async () => {
    const monthYearStr = `${selectedYear}-${selectedMonth}`;
    const summaryData: SummaryEntry = {
      month: monthYearStr,
      batches: selectedBatches.join(', '),
      totalSales: profitCalculation.sales,
      costPrice: deductions.allClosed ? deductions.totalCostPrice : null,
      deliveryFee: deductions.allClosed ? deductions.totalDelivery : null,
      oatPayment: deductions.allClosed ? deductions.totalOat : null,
      fixedExpense: salaryDeduction + localDeliveryFee + otherExpense,
      netProfit: profitCalculation.netProfit,
      isBatchClosed: deductions.allClosed,
      savedAt: new Date().toISOString()
    };
    
    await upsertSummaryEntry(summaryData);
    setSaveMessage('✓ Summary saved to MongoDB');
    setTimeout(() => setSaveMessage(null), 3000);
    
    if (onUpdateSummary) {
      onUpdateSummary(summaryData);
    }
  };

  const selectClasses = "px-4 py-2 rounded-lg border border-slate-200 focus:border-rose-500 outline-none bg-white text-slate-900";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp size={28} />
          <h1 className="text-3xl font-bold">Net Revenue Analysis</h1>
        </div>
        <p className="text-rose-100">Calculate monthly profitability with sales, deductions, and fixed expenses</p>
      </div>

      {/* Month/Year Selection */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Select Period</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className={selectClasses}>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Month</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className={selectClasses}>
              {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {batchesForMonthSorted.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <span className="font-bold">Batches for this month:</span> {batchesForMonthSorted.join(', ')}
            </p>
          </div>
        )}

        {batchesForMonthSorted.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">From Batch</label>
              <select value={startBatch} onChange={(e) => setStartBatch(e.target.value)} className={selectClasses}>
                {batchesForMonthSorted.map(batch => (
                  <option key={batch} value={batch}>{batch}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">To Batch</label>
              <select value={endBatch} onChange={(e) => setEndBatch(e.target.value)} className={selectClasses}>
                {batchesForMonthSorted.map(batch => (
                  <option key={batch} value={batch}>{batch}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Sales Summary */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Sales Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
            <p className="text-xs font-bold text-emerald-600 uppercase">Total Sales</p>
            <p className="text-2xl font-bold text-emerald-900 mt-2">BTN {profitCalculation.sales.toLocaleString()}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-xs font-bold text-blue-600 uppercase">Total Items</p>
            <p className="text-2xl font-bold text-blue-900 mt-2">{monthlyStats.totalItems}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <p className="text-xs font-bold text-purple-600 uppercase">Advance Paid</p>
            <p className="text-2xl font-bold text-purple-900 mt-2">BTN {monthlyStats.totalAdvance.toLocaleString()}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <p className="text-xs font-bold text-orange-600 uppercase">Pending</p>
            <p className="text-2xl font-bold text-orange-900 mt-2">BTN {monthlyStats.totalRemaining.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Deductions (from Financial Reports) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        {!deductions.allClosed && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
            <p className="text-sm text-amber-900">⚠️ <span className="font-semibold">Deductions are pending</span> until batch costs are entered in Financial Reports.</p>
          </div>
        )}

        <h3 className="text-lg font-semibold text-slate-800 mb-4">Deductions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase">Cost Price</p>
            <p className="text-xl font-bold text-slate-900 mt-2">
              {deductions.allClosed ? `BTN ${deductions.totalCostPrice.toLocaleString()}` : '—'}
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase">Delivery Fee (Ashim Pema)</p>
            <p className="text-xl font-bold text-slate-900 mt-2">
              {deductions.allClosed ? `BTN ${deductions.totalDelivery.toLocaleString()}` : '—'}
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase">Oat Payment</p>
            <p className="text-xl font-bold text-slate-900 mt-2">
              {deductions.allClosed ? `BTN ${deductions.totalOat.toLocaleString()}` : '—'}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Salary</label>
            <input
              type="number"
              min="0"
              value={salaryDeduction}
              onChange={(e) => setSalaryDeduction(Number(e.target.value) || 0)}
              className={selectClasses}
            />
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Other Local Delivery Fee</label>
            <input
              type="number"
              min="0"
              value={localDeliveryFee}
              onChange={(e) => setLocalDeliveryFee(Number(e.target.value) || 0)}
              className={selectClasses}
            />
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Other Expense</label>
            <input
              type="number"
              min="0"
              value={otherExpense}
              onChange={(e) => setOtherExpense(Number(e.target.value) || 0)}
              className={selectClasses}
            />
          </div>
        </div>
      </div>

      {/* Profit Calculation */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-white">
        <h3 className="text-xl font-bold mb-6">Net Profit Calculation</h3>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-300">Total Sales</span>
            <span className="font-semibold text-emerald-400">+ BTN {profitCalculation.sales.toLocaleString()}</span>
          </div>
          <div className="h-px bg-slate-700"></div>
          
          {deductions.allClosed && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300">Cost Price</span>
                <span className="font-semibold text-rose-400">- BTN {profitCalculation.cost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300">Delivery Fee (Ashim Pema)</span>
                <span className="font-semibold text-rose-400">- BTN {profitCalculation.delivery.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300">Oat Payment</span>
                <span className="font-semibold text-rose-400">- BTN {profitCalculation.oat.toLocaleString()}</span>
              </div>
            </>
          )}
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-300">Salary</span>
            <span className="font-semibold text-rose-400">- BTN {profitCalculation.salaryExpense.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-300">Other Local Delivery Fee</span>
            <span className="font-semibold text-rose-400">- BTN {profitCalculation.otherLocalDelivery.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-300">Other Expense</span>
            <span className="font-semibold text-rose-400">- BTN {profitCalculation.otherExpenseValue.toLocaleString()}</span>
          </div>
          
          <div className="h-px bg-slate-700"></div>
          <div className="flex justify-between items-center text-lg pt-2">
            <span className="font-bold">Net Profit</span>
            <span className={`text-2xl font-bold ${profitCalculation.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              BTN {profitCalculation.netProfit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-4">
        {saveMessage && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top">
            <CheckCircle size={18} />
            {saveMessage}
          </div>
        )}
        <button
          onClick={handleSaveData}
          disabled={!deductions.allClosed || selectedBatches.length === 0}
          className={`flex-1 px-6 py-3 font-medium rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 ${!deductions.allClosed || selectedBatches.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200'}`}
        >
          <Save size={20} />
          Save to Summary Sheet
        </button>
        <button
          className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all flex justify-center items-center gap-2"
        >
          <Download size={20} />
          Export as PDF
        </button>
      </div>
    </div>
  );
};
