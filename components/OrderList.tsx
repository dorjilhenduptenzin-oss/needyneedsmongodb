
import React, { useState, useMemo, useEffect } from 'react';
import { Order, TransportMode, BatchCost } from '../types';
import { Search, MapPin, Phone, Edit2, Package, Bus, Truck, Mail, Home, X, ArrowRight, Trash2, Edit3, Plus, StickyNote, Loader2 } from 'lucide-react';

interface OrderListProps {
  orders: Order[];
  batchCosts?: BatchCost[];
  isBackgroundLoading?: boolean;
  initialSearch?: string | null;
  onDelete: (id: string | string[]) => void;
  onEdit: (order: Order) => void;
  onAddMore: (order: Order) => void;
  onEditBatchCost?: (batchName: string) => void;
  onUpdateOrders: (orders: Order[]) => void;
  onMoveCustomerOrders?: (orders: Order[], targetBatch: string) => void | Promise<void>;
}

export const OrderList: React.FC<OrderListProps> = ({ orders, batchCosts = [], isBackgroundLoading = false, initialSearch = null, onDelete, onEdit, onAddMore, onEditBatchCost, onUpdateOrders, onMoveCustomerOrders }) => {
  const [isMoving, setIsMoving] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearch ?? '');

  // Seed the search box when arriving here focused on one customer.
  useEffect(() => {
    if (initialSearch) setSearchTerm(initialSearch);
  }, [initialSearch]);
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [batchMoveTarget, setBatchMoveTarget] = useState('');
  
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const uniqueBatches = useMemo(() => Array.from(new Set([
    ...orders.map(o => o.batchName),
    ...(batchCosts || []).map(b => b.batchName)
  ])).filter(Boolean).sort().reverse(), [orders, batchCosts]);

  // Packed status per batch, set in Financial Reports. A batch with no cost
  // config yet counts as not packed.
  const batchPackedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (batchCosts || []).forEach(b => m.set(b.batchName, Boolean(b.isPacked)));
    return m;
  }, [batchCosts]);

  const isBatchPacked = (batchName: string) => batchPackedMap.get(batchName) === true;
  const batchOptionLabel = (batchName: string) => `${batchName} · ${isBatchPacked(batchName) ? 'Packed' : 'Pending'}`;

  const filteredOrders = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return orders.filter(order => {
      const matchesSearch = order.customerName.toLowerCase().includes(q) ||
                            order.phoneNumber.includes(searchTerm) ||
                            order.address.toLowerCase().includes(q) ||
                            (order.productName || '').toLowerCase().includes(q);
      const matchesBatch = batchFilter === 'all' || order.batchName === batchFilter;
      const matchesStatus = statusFilter === 'all' ||
                            (statusFilter === 'paid' && order.isFullPaymentReceived) ||
                            (statusFilter === 'pending' && !order.isFullPaymentReceived);

      return matchesSearch && matchesBatch && matchesStatus;
    });
  }, [orders, searchTerm, batchFilter, statusFilter]);

  const groupedOrdersMap = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    filteredOrders.forEach(order => {
      const key = `${order.customerName.trim().toLowerCase()}_${order.phoneNumber.trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(order);
    });
    return groups;
  }, [filteredOrders]);

  const groupedOrders = useMemo(() => {
    return Object.values(groupedOrdersMap).sort((a: Order[], b: Order[]) => {
       const maxA = Math.max(...a.map(o => o.createdAt));
       const maxB = Math.max(...b.map(o => o.createdAt));
       return maxB - maxA;
    });
  }, [groupedOrdersMap]);

  const selectedGroupOrders = useMemo(() => {
    if (!selectedCustomerKey) return null;
    const group = groupedOrdersMap[selectedCustomerKey];
    if (!group || group.length === 0) return null;
    return [...group].sort((a, b) => b.createdAt - a.createdAt);
  }, [groupedOrdersMap, selectedCustomerKey]);

  // Initialize batchMoveTarget only when a customer is selected (open modal).
  useEffect(() => {
    if (!selectedCustomerKey) {
      setBatchMoveTarget('');
      return;
    }
    if (selectedGroupOrders && selectedGroupOrders.length > 0) {
      setBatchMoveTarget(selectedGroupOrders[0].batchName || '');
    } else {
      setBatchMoveTarget('');
    }
  }, [selectedCustomerKey]);

  // Aggregate unique notes for the selected customer
  const customerNotes = useMemo(() => {
    if (!selectedGroupOrders) return [];
    const notes = selectedGroupOrders
      .map(o => o.note?.trim())
      .filter((note): note is string => !!note);
    return Array.from(new Set(notes));
  }, [selectedGroupOrders]);

  const customerTotals = useMemo(() => {
    if (!selectedGroupOrders) return null;
    return selectedGroupOrders.reduce((acc, o) => {
        const itemTotal = o.sellingPrice * o.quantity;
        const remaining = o.isFullPaymentReceived ? 0 : Math.max(0, itemTotal - o.advancePaid);
        return {
            totalQty: acc.totalQty + o.quantity,
            totalSales: acc.totalSales + itemTotal,
            totalAdvance: acc.totalAdvance + o.advancePaid,
            totalRemaining: acc.totalRemaining + remaining
        };
    }, { totalQty: 0, totalSales: 0, totalAdvance: 0, totalRemaining: 0 });
  }, [selectedGroupOrders]);

  const handleMoveCustomerOrders = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedGroupOrders || !onMoveCustomerOrders) return;
    if (!batchMoveTarget || !batchMoveTarget.trim()) return;
    if (isMoving) return;
    setIsMoving(true);
    try {
      await onMoveCustomerOrders(selectedGroupOrders, batchMoveTarget.trim());
      setSelectedCustomerKey(null);
    } finally {
      setIsMoving(false);
    }
  };

  const handleSingleDelete = (id: string, productName: string) => {
    if (window.confirm(`Are you sure you want to delete the record for "${productName}"?`)) {
      onDelete(id);
    }
  };

  const handleBulkDelete = (ids: string[], customerName: string) => {
    if (window.confirm(`WARNING: Are you sure you want to delete ALL records for ${customerName}? This action cannot be undone.`)) {
      onDelete(ids);
      setSelectedCustomerKey(null);
    }
  };

  const inputClasses = "w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-rose-500 transition-all bg-white text-slate-900 placeholder-slate-400 text-sm";
  const selectClasses = "px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-rose-500 bg-white text-slate-900 text-sm font-medium";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-4 rounded-xl shadow-card border border-slate-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
             type="text" 
             placeholder="Search by customer, phone or product..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className={inputClasses}
          />
        </div>
        
        <div className="flex gap-2">
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className={selectClasses}>
            <option value="all">All Batches</option>
            {uniqueBatches.map(b => <option key={b} value={b}>{batchOptionLabel(b)}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClasses}>
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {batchFilter !== 'all' && (
        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${isBatchPacked(batchFilter) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <span className="text-sm font-bold text-slate-800 font-serif">{batchFilter}</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${isBatchPacked(batchFilter) ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
            {isBatchPacked(batchFilter) ? 'Packed' : 'Not packed yet'}
          </span>
        </div>
      )}

      {isBackgroundLoading && (
        <div className="flex items-center justify-center gap-2 text-slate-400 text-[11px] font-semibold">
          <Loader2 size={13} className="animate-spin" /> Loading more orders…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {groupedOrders.length === 0 && isBackgroundLoading ? (
          [0, 1, 2, 3].map(i => (
            <div key={`sk-${i}`} className="bg-white rounded-xl border border-slate-100 p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-full" />
                <div className="space-y-2">
                  <div className="skeleton h-3 w-40" />
                  <div className="skeleton h-2.5 w-24" />
                </div>
              </div>
              <div className="skeleton h-6 w-20" />
            </div>
          ))
        ) : groupedOrders.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-100 border-dashed font-medium">
            No matching records found.
          </div>
        ) : (
          groupedOrders.map(group => {
            const customer = group[0];
            const totalItems = group.reduce((sum, o) => sum + o.quantity, 0);
            const totalRemaining = group.reduce((sum, o) => {
               if (o.isFullPaymentReceived) return sum;
               return sum + Math.max(0, (o.sellingPrice * o.quantity) - o.advancePaid);
            }, 0);
            const isPaid = totalRemaining <= 0;
            const customerKey = `${customer.customerName.trim().toLowerCase()}_${customer.phoneNumber.trim()}`;

            return (
              <div 
                key={customerKey}
                onClick={() => setSelectedCustomerKey(customerKey)}
                className="bg-white rounded-xl shadow-card border border-slate-100 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 hover:border-slate-200 cursor-pointer group card-lift"
              >
                <div className="flex items-center gap-4 w-full sm:w-auto">
                   <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm shrink-0">
                     {customer.customerName.charAt(0).toUpperCase()}
                   </div>
                   <div className="flex-1">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        {customer.customerName}
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold uppercase tracking-tight">{totalItems} Items</span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <Phone size={12} className="text-slate-300" /> {customer.phoneNumber}
                      </p>
                   </div>
                </div>
                <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                   <div className="text-right">
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Due Balance</p>
                     <p className={`font-bold ${!isPaid ? 'text-rose-600' : 'text-emerald-600'}`}>
                       {!isPaid ? `BTN ${totalRemaining.toLocaleString()}` : 'Settled'}
                     </p>
                   </div>
                   <ArrowRight size={18} className="text-slate-200 group-hover:text-indigo-500 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedCustomerKey && selectedGroupOrders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              <div className="bg-slate-50/50 px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex-1">
                    <h2 className="font-bold text-xl text-slate-900 font-serif">{selectedGroupOrders[0].customerName}</h2>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-medium">
                       <span className="flex items-center gap-1"><Phone size={12} /> {selectedGroupOrders[0].phoneNumber}</span>
                       <span className="flex items-center gap-1"><MapPin size={12} /> {selectedGroupOrders[0].address}</span>
                    </div>
                    {customerNotes.length > 0 && (
                       <div className="mt-3 w-full flex items-start gap-2 p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200">
                          <StickyNote size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                             <p className="font-bold text-sm">Customer Note:</p>
                             <p className="text-sm italic mt-1">{customerNotes.join(', ')}</p>
                          </div>
                       </div>
                    )}
                 </div>
                 <button onClick={() => setSelectedCustomerKey(null)} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
                   <X size={20} />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase font-bold tracking-wider sticky top-0 z-10 border-b border-slate-100">
                          <tr>
                              <th className="px-6 py-3">Product Info</th>
                              <th className="px-6 py-3 text-right">Total Price</th>
                              <th className="px-6 py-3 text-right">Balance</th>
                              <th className="px-6 py-3 text-center">Manage</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                          {selectedGroupOrders.map(order => {
                              const itemTotal = order.sellingPrice * order.quantity;
                              const remaining = order.isFullPaymentReceived ? 0 : Math.max(0, itemTotal - order.advancePaid);
                              return (
                                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900 text-sm">{order.productName}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1.5 border border-slate-200">
                                              {order.batchName}
                                              <button
                                                onClick={(e) => { e.stopPropagation(); onEditBatchCost?.(order.batchName); }}
                                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                title="Edit Batch Cost"
                                              >
                                                <Edit3 size={10} />
                                              </button>
                                            </span>
                                            <span className={`text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-full border ${isBatchPacked(order.batchName) ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                              {isBatchPacked(order.batchName) ? 'Packed' : 'Not packed'}
                                            </span>
                                            <span className="text-[10px] text-slate-300">•</span>
                                            <span className="text-[10px] text-slate-500 font-medium">{order.quantity} Units</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-700 text-sm">BTN {itemTotal.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        {remaining > 0 ? (
                                            <span className="text-rose-600 font-bold text-sm">BTN {remaining.toLocaleString()}</span>
                                        ) : (
                                            <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-tighter">Paid</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => onEdit(order)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors" title="Edit"><Edit2 size={14}/></button>
                                            <button onClick={() => handleSingleDelete(order.id, order.productName)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors" title="Delete"><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>

              {customerTotals && (
                  <div className="bg-slate-50 p-6 border-t border-slate-100">
                      <div className="flex justify-between items-end mb-6">
                          <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Remaining</p>
                              <p className={`text-2xl font-bold font-serif ${customerTotals.totalRemaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  BTN {customerTotals.totalRemaining.toLocaleString()}
                              </p>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Items</p>
                              <p className="text-xl font-bold text-slate-900">{customerTotals.totalQty} Units</p>
                          </div>
                      </div>
                      <div className="space-y-3 mb-4">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Move all orders for this customer to batch</label>
                        <div className="flex gap-3">
                          <select
                            value={batchMoveTarget}
                            onChange={(e) => setBatchMoveTarget(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 bg-white text-slate-900 text-sm font-medium"
                          >
                            <option value="">Select batch</option>
                            {uniqueBatches.map(batchName => (
                                <option key={batchName} value={batchName}>{batchOptionLabel(batchName)}</option>
                              ))}
                          </select>
                          <button
                            onClick={handleMoveCustomerOrders}
                            disabled={isMoving || !batchMoveTarget}
                            className="px-5 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isMoving ? <><Loader2 size={14} className="animate-spin" /> Moving…</> : 'Move Customer'}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                          <button 
                            onClick={() => onAddMore(selectedGroupOrders[0])}
                            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                          >
                             <Plus size={16} /> Add More Item
                          </button>
                          <button 
                            onClick={() => handleBulkDelete(selectedGroupOrders.map(o => o.id), selectedGroupOrders[0].customerName)} 
                            className="flex-1 py-3 border border-rose-200 text-rose-500 font-bold rounded-xl hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                          >
                             <Trash2 size={16} /> Delete Customer History
                          </button>
                      </div>
                  </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};
