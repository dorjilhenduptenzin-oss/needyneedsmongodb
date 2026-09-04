
import React, { useMemo, useState, useEffect } from 'react';
import { Order, BatchSummary, BatchCost, CustomerTrend } from '../types';
import { DELIVERY_FEE_PER_ITEM, OAT_RATE, APP_NAME } from '../constants';
import { Download, Edit3, X, Save, CheckCircle, PieChart, Wallet, BarChart3, Users } from 'lucide-react';

interface BatchAnalyticsProps {
  orders: Order[];
  batchCosts: BatchCost[];
  onUpdateBatchCost: (cost: BatchCost) => void;
  initialEditBatch?: string | null;
}

export const BatchAnalytics: React.FC<BatchAnalyticsProps> = ({ orders, batchCosts, onUpdateBatchCost, initialEditBatch }) => {
  const [viewMode, setViewMode] = useState<'batch' | 'monthly' | 'trends'>('batch');
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchVersion, setEditingBatchVersion] = useState<number | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const [editingBatchPackedAt, setEditingBatchPackedAt] = useState<string | null>(null);
  
  const [editForm, setEditForm] = useState<{
    costPrice: number | '';
    oatInput: number | '';
    deliveryFeeQty: number | '';
    isPacked: boolean;
  }>({
    costPrice: '',
    oatInput: '',
    deliveryFeeQty: '',
    isPacked: false
  });

  useEffect(() => {
    if (!editingBatch) setSaveStatus('idle');
  }, [editingBatch]);

  const batchData = useMemo(() => {
    const batches: Record<string, Order[]> = {};
    orders.forEach(o => {
      if (!batches[o.batchName]) batches[o.batchName] = [];
      batches[o.batchName].push(o);
    });

    return Object.entries(batches).map(([name, batchOrders]) => {
      const costConfig = batchCosts.find(c => c.batchName === name) || { totalCostPrice: 0, oatInputValue: 0, deliveryFeeQuantity: undefined, isPacked: false, packedAt: null };
      const totalItems = batchOrders.reduce((acc, o) => acc + o.quantity, 0);
      const totalSales = batchOrders.reduce((acc, o) => acc + (o.sellingPrice * o.quantity), 0);
      
      const finalDeliveryQty = costConfig.deliveryFeeQuantity !== undefined ? costConfig.deliveryFeeQuantity : totalItems;
      const deliveryFee = finalDeliveryQty * DELIVERY_FEE_PER_ITEM;
      const oatPayment = (costConfig.oatInputValue || 0) * OAT_RATE;
      const totalCostPrice = costConfig.totalCostPrice || 0;
      
      const netProfit = totalSales - (deliveryFee + oatPayment + totalCostPrice);
      const date = new Date(batchOrders[0].createdAt);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      return {
        batchName: name,
        orderCount: batchOrders.length,
        totalItems,
        totalSales,
        deliveryFee,
        oatPayment,
        totalCostPrice,
        netProfit,
        monthYear,
        oatInputValue: costConfig.oatInputValue || 0,
        deliveryFeeQuantity: finalDeliveryQty,
        isPacked: Boolean(costConfig.isPacked),
        packedAt: costConfig.packedAt || null
      } as BatchSummary & { isPacked: boolean; packedAt: string | null };
    }).sort((a, b) => Number(a.isPacked) - Number(b.isPacked) || b.monthYear.localeCompare(a.monthYear));
  }, [orders, batchCosts]);

  const monthlyData = useMemo(() => {
    const months: Record<string, BatchSummary> = {};
    batchData.forEach(batch => {
      if (!months[batch.monthYear]) {
        months[batch.monthYear] = {
          batchName: 'All', monthYear: batch.monthYear, orderCount: 0, totalItems: 0,
          totalSales: 0, deliveryFee: 0, oatPayment: 0, totalCostPrice: 0, netProfit: 0,
          oatInputValue: 0, deliveryFeeQuantity: 0
        };
      }
      const m = months[batch.monthYear];
      m.orderCount += batch.orderCount; m.totalItems += batch.totalItems; m.totalSales += batch.totalSales;
      m.deliveryFee += batch.deliveryFee; m.oatPayment += batch.oatPayment; m.totalCostPrice += batch.totalCostPrice;
      m.netProfit += batch.netProfit;
    });
    return Object.values(months).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
  }, [batchData]);

  const handleEditClick = (batch: BatchSummary) => {
    setEditingBatch(batch.batchName);
    const storedCost = batchCosts.find(c => c.batchName === batch.batchName);
    setEditingBatchPackedAt(storedCost?.packedAt || null);
    setEditingBatchVersion(storedCost?.version ?? 1);
    setEditForm({
      costPrice: storedCost?.totalCostPrice || '',
      oatInput: storedCost?.oatInputValue || '',
      deliveryFeeQty: storedCost?.deliveryFeeQuantity !== undefined ? storedCost.deliveryFeeQuantity : batch.totalItems,
      isPacked: Boolean(storedCost?.isPacked)
    });
  };

  const handleSaveCost = async () => {
    if (!editingBatch) return;
    const packedAt = editForm.isPacked ? (editingBatchPackedAt || new Date().toISOString()) : null;

    try {
      await onUpdateBatchCost({
        batchName: editingBatch,
        totalCostPrice: editForm.costPrice === '' ? 0 : editForm.costPrice,
        oatInputValue: editForm.oatInput === '' ? 0 : editForm.oatInput,
        deliveryFeeQuantity: editForm.deliveryFeeQty === '' ? 0 : editForm.deliveryFeeQty,
        isPacked: editForm.isPacked,
        packedAt,
        version: editingBatchVersion ?? 1
      });
      setSaveStatus('success');
      setTimeout(() => {
        setEditingBatch(null);
        setEditingBatchPackedAt(null);
        setEditingBatchVersion(undefined);
      }, 1200);
    } catch (err: any) {
      // App surfaces the error in the global toast; just leave the modal open.
      setSaveStatus('idle');
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      // Load the PDF stack on demand so it stays out of the initial bundle.
      const [{ jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const autoTable = (autoTableMod as any).default || autoTableMod;
      const doc = new jsPDF();
      const tableColumn = ["Batch", "Orders", "Sales", "Cost Price", "Delivery", "Oat Pay", "Profit"];
      const tableRows = displayData.map(d => [d.batchName, d.orderCount, `BTN ${d.totalSales.toLocaleString()}`, `BTN ${d.totalCostPrice.toLocaleString()}`, `BTN ${d.deliveryFee.toLocaleString()}`, `BTN ${d.oatPayment.toLocaleString()}`, `BTN ${d.netProfit.toLocaleString()}`]);
      autoTable(doc, { head: [tableColumn], body: tableRows });
      doc.save(`${APP_NAME}_Report.pdf`);
    } catch (err: any) {
      alert(err?.message || 'Unable to generate the PDF report.');
    } finally {
      setIsExporting(false);
    }
  };

  const displayData = viewMode === 'batch' ? batchData : monthlyData;

  const labelClasses = "block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2";
  const inputClasses = "w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-white font-semibold text-slate-900";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative pb-20">
       {editingBatch && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200">
              {saveStatus === 'success' ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Costs Updated</h3>
                  <p className="text-sm text-slate-500 mt-1">Closing window...</p>
                </div>
             ) : (
               <>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-900 font-serif">Financial Config</h3>
                  <button onClick={() => setEditingBatch(null)} className="p-2 text-slate-300 hover:text-slate-900 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-5">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                     <Wallet size={18} className="text-indigo-600" />
                     <span className="text-sm font-bold text-slate-700">{editingBatch} Inventory: {batchData.find(b => b.batchName === editingBatch)?.totalItems} items</span>
                  </div>

                  <div>
                    <label className={labelClasses}>Base Cost (Manual)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">BTN</span>
                      <input type="number" min="0" value={editForm.costPrice} onChange={(e) => setEditForm(prev => ({ ...prev, costPrice: e.target.value === '' ? '' : parseFloat(e.target.value) }))} className={`${inputClasses} pl-12`} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClasses}>Delivery Qty (x{DELIVERY_FEE_PER_ITEM})</label>
                    <input type="number" min="0" value={editForm.deliveryFeeQty} onChange={(e) => setEditForm(prev => ({ ...prev, deliveryFeeQty: e.target.value === '' ? '' : parseFloat(e.target.value) }))} className={inputClasses} />
                  </div>

                  <div>
                    <label className={labelClasses}>Oat Qty (x{OAT_RATE})</label>
                    <input type="number" min="0" value={editForm.oatInput} onChange={(e) => setEditForm(prev => ({ ...prev, oatInput: e.target.value === '' ? '' : parseFloat(e.target.value) }))} className={inputClasses} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Batch Status</div>
                        <div className="text-sm text-slate-700 mt-1">{editForm.isPacked ? 'Packed and ready to ignore in the queue' : 'Still pending / not packed yet'}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={editForm.isPacked}
                        onChange={(e) => setEditForm(prev => ({ ...prev, isPacked: e.target.checked }))}
                        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button onClick={() => setEditingBatch(null)} className="flex-1 py-3 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
                    <button onClick={handleSaveCost} className="flex-1 py-3 bg-indigo-600 text-white font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"><Save size={14} /> Update</button>
                  </div>
                </div>
               </>
             )}
           </div>
         </div>
       )}

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
         <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto">
            <button onClick={() => setViewMode('batch')} className={`flex-1 md:flex-none px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${viewMode === 'batch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <BarChart3 size={14} /> Batches
            </button>
            <button onClick={() => setViewMode('monthly')} className={`flex-1 md:flex-none px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${viewMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <PieChart size={14} /> Monthly
            </button>
         </div>
         <button onClick={handleDownloadPDF} disabled={isExporting} className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-black transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-60"><Download size={14} /> {isExporting ? 'Preparing...' : 'Export Report'}</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">{viewMode === 'batch' ? 'Reference' : 'Month'}</th>
                <th className="px-4 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-4 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orders</th>
                <th className="px-4 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Delivery Qty</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50/20">Sales</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expenses</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-widest bg-indigo-50/20">Net Profit</th>
                {viewMode === 'batch' && <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 font-serif">{viewMode === 'batch' ? row.batchName : row.monthYear}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${row.isPacked ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                      {row.isPacked ? 'Packed' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-center font-semibold text-slate-500">{row.orderCount}</td>
                  <td className="px-4 py-4 text-sm text-center font-semibold text-slate-500">{row.deliveryFeeQuantity}</td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-emerald-600">BTN {row.totalSales.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                      <div className="flex flex-col text-[10px] font-medium text-slate-400 uppercase space-y-0.5">
                        <span>Cost: {row.totalCostPrice.toLocaleString()}</span>
                        <span>Del: {row.deliveryFee.toLocaleString()}</span>
                        <span>Oat: {row.oatPayment.toLocaleString()}</span>
                      </div>
                  </td>
                  <td className="px-6 py-4 text-base text-right font-bold text-indigo-600 bg-indigo-50/5">BTN {row.netProfit.toLocaleString()}</td>
                  {viewMode === 'batch' && (
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => handleEditClick(row)} className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit3 size={16} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
