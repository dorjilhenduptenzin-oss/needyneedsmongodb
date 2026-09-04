import React, { useMemo, useState } from 'react';
import { Order, BatchCost } from '../types';
import { DELIVERY_FEE_PER_ITEM, OAT_RATE } from '../constants';
import { DollarSign, ShoppingBag, AlertCircle, Wallet, LayoutGrid, BarChart3, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DashboardProps {
  orders: Order[];
  batchCosts: BatchCost[];
}

type DashboardView = 'overview' | 'batch' | 'month';

export const Dashboard: React.FC<DashboardProps> = ({ orders, batchCosts }) => {
  const [viewMode, setViewMode] = useState<DashboardView>('overview');

  // 1. GLOBAL STATS
  const stats = useMemo(() => {
    // Base Calculation
    const baseStats = orders.reduce((acc, order) => {
      const totalSelling = order.sellingPrice * order.quantity;
      let paid = 0;
      if (order.isFullPaymentReceived) {
        paid = totalSelling; 
      } else {
        paid = order.advancePaid;
      }
      const due = Math.max(0, totalSelling - paid);
      return {
        totalOrders: acc.totalOrders + 1,
        totalRevenue: acc.totalRevenue + totalSelling,
        totalOutstanding: acc.totalOutstanding + due,
        totalItems: acc.totalItems + order.quantity
      };
    }, { totalOrders: 0, totalRevenue: 0, totalOutstanding: 0, totalItems: 0 });

    // Expense Calculation Logic
    const itemsByBatch: Record<string, number> = {};
    orders.forEach(o => {
      itemsByBatch[o.batchName] = (itemsByBatch[o.batchName] || 0) + o.quantity;
    });

    const uniqueBatches = Object.keys(itemsByBatch);

    const totalExpenses = uniqueBatches.reduce((acc, batchName) => {
      const costConfig = batchCosts.find(c => c.batchName === batchName);
      const totalCostPrice = costConfig?.totalCostPrice || 0;
      const oatPayment = (costConfig?.oatInputValue || 0) * OAT_RATE;
      
      const deliveryQty = costConfig?.deliveryFeeQuantity !== undefined 
         ? costConfig.deliveryFeeQuantity 
         : (itemsByBatch[batchName] || 0);
       
      const deliveryFee = deliveryQty * DELIVERY_FEE_PER_ITEM;

      return acc + totalCostPrice + oatPayment + deliveryFee;
    }, 0);

    const netRevenue = baseStats.totalRevenue - totalExpenses;

    return { ...baseStats, totalExpenses, netRevenue };
  }, [orders, batchCosts]);

  // 2. BATCH PERFORMANCE DATA
  const batchPerformance = useMemo(() => {
    const batches: Record<string, any> = {};
    
    // Group Items
    const itemsByBatch: Record<string, number> = {};
    orders.forEach(o => {
        itemsByBatch[o.batchName] = (itemsByBatch[o.batchName] || 0) + o.quantity;
    });

    orders.forEach(order => {
        if (!batches[order.batchName]) {
            batches[order.batchName] = { name: order.batchName, revenue: 0, profit: 0, items: 0 };
        }
        batches[order.batchName].revenue += (order.sellingPrice * order.quantity);
        batches[order.batchName].items += order.quantity;
    });

    return Object.values(batches).map((b: any) => {
        const costConfig = batchCosts.find(c => c.batchName === b.name);
        const totalCostPrice = costConfig?.totalCostPrice || 0;
        const oatPayment = (costConfig?.oatInputValue || 0) * OAT_RATE;
        const deliveryQty = costConfig?.deliveryFeeQuantity !== undefined ? costConfig.deliveryFeeQuantity : itemsByBatch[b.name];
        const deliveryFee = deliveryQty * DELIVERY_FEE_PER_ITEM;
        
        const totalExpenses = totalCostPrice + oatPayment + deliveryFee;
        return {
            name: b.name,
            revenue: b.revenue,
            profit: b.revenue - totalExpenses,
            items: b.items
        };
    }).sort((a, b) => b.profit - a.profit); // Sort by highest profit
  }, [orders, batchCosts]);

  // 3. MONTHLY PERFORMANCE DATA
  const monthlyPerformance = useMemo(() => {
      const months: Record<string, any> = {};
      const batchMap = new Map<string, string>(); // BatchName -> MonthKey
      
      // Associate batches to months based on first order date
      orders.forEach(o => {
          if (!batchMap.has(o.batchName)) {
              const d = new Date(o.createdAt);
              const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
              batchMap.set(o.batchName, m);
          }
      });

      // Aggregate Profit per Month (using Batch Profit Logic aggregated by month)
      batchPerformance.forEach(batch => {
          const monthKey = batchMap.get(batch.name) || 'Unknown';
          if (!months[monthKey]) {
              months[monthKey] = { name: monthKey, profit: 0, revenue: 0 };
          }
          months[monthKey].profit += batch.profit;
          months[monthKey].revenue += batch.revenue;
      });

      return Object.values(months).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, batchPerformance]);


  // Prepare data for the Overview Chart (Financial Split)
  const overviewChartData = [
    { name: 'Total Revenue', amount: stats.totalRevenue, color: '#10b981' }, 
    { name: 'Expenses', amount: stats.totalExpenses, color: '#f59e0b' },
    { name: 'Net Profit', amount: stats.netRevenue, color: '#6366f1' },
    { name: 'Outstanding', amount: stats.totalOutstanding, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100 flex flex-col justify-between h-32 card-lift">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-sm">Total Orders</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <ShoppingBag size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-slate-900">{stats.totalOrders}</h3>
        </div>

        {/* Total Outstanding */}
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100 flex flex-col justify-between h-32 card-lift">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-sm">Total Outstanding</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <AlertCircle size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-rose-600">BTN {stats.totalOutstanding.toLocaleString()}</h3>
        </div>

        {/* Total Revenue */}
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100 flex flex-col justify-between h-32 card-lift">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-sm">Total Sales</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign size={20} />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-emerald-600">BTN {stats.totalRevenue.toLocaleString()}</h3>
        </div>

        {/* Net Revenue */}
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100 flex flex-col justify-between h-32 card-lift ring-2 ring-indigo-50">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium text-sm">Net Profit</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Wallet size={20} />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-indigo-600">BTN {stats.netRevenue.toLocaleString()}</h3>
            <p className="text-xs text-slate-400 mt-1">After Costs, Oat Pay & Delivery</p>
          </div>
        </div>
      </div>

      {/* Main Content Area with Tabs */}
      <div className="bg-white rounded-xl shadow-card border border-slate-100 flex flex-col min-h-[500px]">
         {/* Tabs Header */}
         <div className="flex border-b border-slate-100 p-2 overflow-x-auto">
             <button
                onClick={() => setViewMode('overview')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'overview' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
             >
                <LayoutGrid size={18} /> Overview
             </button>
             <button
                onClick={() => setViewMode('batch')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'batch' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
             >
                <BarChart3 size={18} /> Profit by Batch
             </button>
             <button
                onClick={() => setViewMode('month')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'month' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
             >
                <Calendar size={18} /> Profit by Month
             </button>
         </div>
         
         {/* Tab Content */}
         <div className="p-6 flex-1 flex flex-col">
            
            {/* VIEW 1: OVERVIEW */}
            {viewMode === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 accent-tick">Total Financial Split</h3>
                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={overviewChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `BTN ${value}`} />
                                    <Tooltip 
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [`BTN ${value.toLocaleString()}`, 'Amount']}
                                    />
                                    <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                                        {overviewChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-900 mb-4 accent-tick">How Net Profit is Calculated</h3>
                        <ul className="space-y-4 text-sm text-slate-600">
                            <li className="flex justify-between items-center border-b border-slate-200 pb-2">
                                <span>Total Revenue</span>
                                <span className="font-bold text-emerald-600">BTN {stats.totalRevenue.toLocaleString()}</span>
                            </li>
                            <li className="flex justify-between items-center text-rose-600">
                                <span>Total Expenses (Calculated per Batch)</span>
                                <span>- BTN {stats.totalExpenses.toLocaleString()}</span>
                            </li>
                            <li className="text-xs pl-4 space-y-1 text-slate-400">
                                <p>• Delivery Fee ({DELIVERY_FEE_PER_ITEM}/item or Fixed Batch Qty)</p>
                                <p>• Oat Payment (Input x {OAT_RATE})</p>
                                <p>• Batch Cost Price (Manual Input)</p>
                            </li>
                            <li className="flex justify-between items-center pt-2 border-t border-slate-300">
                                <span className="font-bold text-indigo-900 text-lg">Net Profit</span>
                                <span className="font-bold text-indigo-600 text-lg">BTN {stats.netRevenue.toLocaleString()}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            {/* VIEW 2: BY BATCH */}
            {viewMode === 'batch' && (
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-2 accent-tick">Net Profit by Batch</h3>
                    <p className="text-sm text-slate-500 mb-6">Batches sorted by highest profitability</p>
                    <div className="w-full h-[500px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={batchPerformance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value) => `${value}`} />
                                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number) => [`BTN ${value.toLocaleString()}`, 'Net Profit']}
                                />
                                <Bar dataKey="profit" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

             {/* VIEW 3: BY MONTH */}
             {viewMode === 'month' && (
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-2 accent-tick">Profitability Over Time</h3>
                    <p className="text-sm text-slate-500 mb-6">Net Profit aggregated by month</p>
                    <div className="w-full h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value}`} />
                                <Tooltip 
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number) => [`BTN ${value.toLocaleString()}`, 'Net Profit']}
                                />
                                <Bar dataKey="profit" fill="#10b981" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

         </div>
      </div>
    </div>
  );
};