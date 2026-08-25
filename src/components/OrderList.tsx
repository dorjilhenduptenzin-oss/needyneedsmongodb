
import React, { useState, useMemo, useEffect } from 'react';
import { Order, TransportMode, BatchCost } from '../types';
import { Search, MapPin, Phone, Edit2, Package, Bus, Truck, Mail, Home, X, ArrowRight, Layers, Trash2, StickyNote, Plus } from 'lucide-react';

interface OrderListProps {
  orders: Order[];
  batchCosts?: BatchCost[]; 
  onDelete: (id: string | string[]) => void;
  onEdit: (order: Order) => void;
  onAddMore: (order: Order) => void;
  onEditBatchCost?: (batchName: string) => void;
  onUpdateOrders: (orders: Order[]) => void;
  onMoveCustomerOrders?: (orders: Order[], targetBatch: string) => void;
}

export const OrderList: React.FC<OrderListProps> = ({ orders, batchCosts = [], onDelete, onEdit, onAddMore, onEditBatchCost, onUpdateOrders, onMoveCustomerOrders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [batchMoveTarget, setBatchMoveTarget] = useState('');
  
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const uniqueBatches = Array.from(new Set([
    ...orders.map(o => o.batchName),
    ...(batchCosts || []).map(b => b.batchName)
  ])).filter(Boolean).sort().reverse();

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.phoneNumber.includes(searchTerm) ||
                          order.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (order.productName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBatch = batchFilter === 'all' || order.batchName === batchFilter;
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'paid' && order.isFullPaymentReceived) ||
                          (statusFilter === 'pending' && !order.isFullPaymentReceived);
    
    return matchesSearch && matchesBatch && matchesStatus;
  });

  const groupedOrdersMap = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    filteredOrders.forEach(order => {
      const key = `${order.customerName.trim().toLowerCase()}_${order.phoneNumber.trim()}`;
      if (!groups[key]) {
        groups[key] = [];
      }
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

  // Aggregate unique notes for the selected customer
  const customerNotes = useMemo(() => {
    if (!selectedGroupOrders) return [];
    const notes = selectedGroupOrders
      .map(o => o.note?.trim())
      .filter((note): note is string => !!note);
    return Array.from(new Set(notes));
  }, [selectedGroupOrders]);

  useEffect(() => {
    if (selectedCustomerKey && (!selectedGroupOrders || selectedGroupOrders.length === 0)) {
      setSelectedCustomerKey(null);
    }
  }, [selectedGroupOrders, selectedCustomerKey]);

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

  const getTransportIcon = (mode: TransportMode) => {
    switch (mode) {
      case 'Bus': return <Bus size={14} />;
      case 'Taxi': return <Truck size={14} />;
      case 'Post': return <Mail size={14} />;
      case 'Keep at Shop': return <Home size={14} />;
      default: return <Package size={14} />;
    }
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this specific record?')) {
      onDelete(id);
    }
  };
  const handleDeleteCustomerHistory = (e: React.MouseEvent, orders: Order[] | null) => {
    e.stopPropagation();
    if (!orders || orders.length === 0) return;
    if (window.confirm(`WARNING: Are you sure you want to delete ALL records for ${orders[0].customerName}? This action cannot be undone.`)) {
      onDelete(orders.map(o => o.id));
      setSelectedCustomerKey(null);
    }
  };
  const handleMoveCustomerOrders = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedGroupOrders || !onMoveCustomerOrders) return;
    if (!batchMoveTarget || !batchMoveTarget.trim()) return;
    onMoveCustomerOrders(selectedGroupOrders, batchMoveTarget.trim());
    setSelectedCustomerKey(null);
  };
  // Initialize batchMoveTarget only when a customer modal opens.
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


  const inputClasses = "w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 transition-all bg-white text-slate-900 placeholder-slate-400";
  const selectClasses = "px-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-rose-500 bg-white text-slate-900";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
             type="text" 
             placeholder="Search customers or products..." 
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className={inputClasses}
          />
        </div>
        
        <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className={selectClasses}>
          <option value="all">All Batches</option>
          {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClasses}>
          <option value="all">All Status</option>
          <option value="pending">Pending Payment</option>
          <option value="paid">Fully Paid</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {groupedOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-100 border-dashed">
            <p>No orders found.</p>
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
                className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              >
                <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                     <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg shrink-0 relative">
                       {customer.customerName.charAt(0).toUpperCase()}
                       <div className="absolute -bottom-1 -right-1 bg-indigo-100 text-indigo-600 rounded-full p-0.5 border border-white">
                          <Layers size={10} />
                       </div>
                     </div>
                     <div>
                       <div className="flex items-center gap-2">
                         <h3 className="font-bold text-slate-900">{customer.customerName}</h3>
                         <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-full border border-indigo-100">
                           {totalItems} Item{totalItems !== 1 ? 's' : ''}
                         </span>
                       </div>
                       <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                         <Phone size={12} /> {customer.phoneNumber}
                       </p>
                     </div>
                  </div>
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                     <div className="text-right">
                       <p className="text-xs text-slate-400 font-bold uppercase">Total Due</p>
                       <p className={`font-bold ${!isPaid ? 'text-rose-600' : 'text-emerald-600'}`}>
                         {!isPaid ? `BTN ${totalRemaining.toFixed(2)}` : 'PAID'}
                       </p>
                     </div>
                     <div className="flex gap-2 items-center">
                        <button
                            type="button"
                            onClick={(e) => handleDeleteCustomerHistory(e, group)}
                            className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-full transition-colors border border-rose-100"
                            title="Delete All Customer Records"
                        >
                            <Trash2 size={20} />
                        </button>
                        <span className="p-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight size={18} />
                        </span>
                     </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedGroupOrders && selectedGroupOrders.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-start shrink-0">
                 <div className="flex-1">
                    <h2 className="font-bold text-xl text-slate-900">
                       {selectedGroupOrders[0].customerName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                       <span className="text-sm text-slate-500 flex items-center gap-1.5"><Phone size={14} className="text-slate-400"/> {selectedGroupOrders[0].phoneNumber}</span>
                       <span className="text-sm text-slate-500 flex items-center gap-1.5"><MapPin size={14} className="text-slate-400"/> {selectedGroupOrders[0].address}</span>
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
                 <button onClick={() => setSelectedCustomerKey(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full">
                   <X size={20} />
                 </button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold sticky top-0 z-10 shadow-sm">
                          <tr>
                              <th className="px-6 py-3">Product / Batch</th>
                              <th className="px-6 py-3 text-center">Transport</th>
                              <th className="px-6 py-3 text-right">Price</th>
                              <th className="px-6 py-3 text-right">Balance</th>
                              <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {selectedGroupOrders.map(order => {
                              const itemTotal = order.sellingPrice * order.quantity;
                              const remaining = order.isFullPaymentReceived ? 0 : Math.max(0, itemTotal - order.advancePaid);
                              return (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-medium text-slate-900 text-sm">{order.productName}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{order.batchName}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center justify-center p-1.5 rounded bg-slate-100 text-slate-500">
                                            {getTransportIcon(order.transportMode)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm">
                                        <p className="text-slate-900">BTN {itemTotal.toLocaleString()}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm">
                                        {remaining > 0 ? (
                                            <span className="text-rose-600 font-bold">BTN {remaining.toLocaleString()}</span>
                                        ) : (
                                            <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full">PAID</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); onEdit(order); setSelectedCustomerKey(null); }} 
                                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                              type="button"
                                              onClick={(e) => handleDeleteItem(e, order.id)} 
                                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
              {customerTotals && (
                  <div className="bg-slate-50 p-6 border-t border-slate-200 shrink-0">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                          <div>
                              <p className="text-xs font-bold text-slate-400 uppercase">Total Items</p>
                              <p className="text-xl font-bold text-slate-900">{customerTotals.totalQty}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-xs font-bold text-slate-400 uppercase">Net Balance to Pay</p>
                              <p className={`text-xl font-bold ${customerTotals.totalRemaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {customerTotals.totalRemaining > 0 ? `BTN ${customerTotals.totalRemaining.toLocaleString()}` : 'All Paid'}
                              </p>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                            <button onClick={(e) => { e.stopPropagation(); onAddMore(selectedGroupOrders[0]); }} className="py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                                <Plus size={18} /> Add More Items
                            </button>
                            <button onClick={(e) => handleDeleteCustomerHistory(e, selectedGroupOrders)} className="py-3 bg-white border border-rose-200 text-rose-600 font-medium rounded-xl hover:bg-rose-50 transition-colors flex items-center justify-center gap-2">
                                <Trash2 size={18} /> Delete All Records
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
