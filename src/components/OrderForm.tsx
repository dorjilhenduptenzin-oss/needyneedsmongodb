
import React, { useState, useEffect } from 'react';
import { Order, OrderFormData, TransportMode } from '../types';
import { TRANSPORT_MODES, FIXED_CHARGE } from '../constants';
import { Save, Plus, Trash2, Layers } from 'lucide-react';
import { distributeAdvanceAcrossItems } from '../utils/advanceDistribution';

interface OrderFormProps {
  initialData?: OrderFormData;
  customerContext?: Partial<Order>;
  existingBatches: string[];
  onSubmit: (data: OrderFormData | OrderFormData[]) => void;
  onCancel: () => void;
}

interface OrderItem {
  id: string;
  productName: string;
  basePrice: number | '';
  quantity: number;
}

export const OrderForm: React.FC<OrderFormProps> = ({ initialData, customerContext, existingBatches, onSubmit, onCancel }) => {
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [transportMode, setTransportMode] = useState<TransportMode>('Keep at Shop');
  const [note, setNote] = useState('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [isFullPaymentReceived, setIsFullPaymentReceived] = useState(false);

  const currentYear = new Date().getFullYear().toString();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  
  const [bYear, setBYear] = useState(currentYear);
  const [bMonth, setBMonth] = useState(currentMonth);
  const [bNumber, setBNumber] = useState('01');
  
  const fullBatchName = `BATCH-${bYear}${bMonth}-${bNumber}`;
  const [isMultiItem, setIsMultiItem] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([
    { id: '1', productName: '', basePrice: '', quantity: 1 }
  ]);

  const [totals, setTotals] = useState({
    totalSellingPrice: 0,
    totalQuantity: 0,
    remainingBalance: 0
  });

  const parseBatchName = (name: string) => {
    const regex = /^BATCH-(\d{4})(\d{2})-(\d{2})$/;
    const match = name.match(regex);
    if (match) {
      return { year: match[1], month: match[2], number: match[3] };
    }
    return null;
  };

  useEffect(() => {
    if (initialData) {
      setCustomerName(initialData.customerName);
      setAddress(initialData.address);
      setPhoneNumber(initialData.phoneNumber);
      setTransportMode(initialData.transportMode);
      setNote(initialData.note || '');
      setAdvancePaid(initialData.advancePaid);
      setIsFullPaymentReceived(initialData.isFullPaymentReceived);
      
      const parts = parseBatchName(initialData.batchName);
      if (parts) {
        setBYear(parts.year);
        setBMonth(parts.month);
        setBNumber(parts.number);
      }

      setItems([{
        id: '1',
        productName: initialData.productName,
        basePrice: initialData.sellingPrice - FIXED_CHARGE,
        quantity: initialData.quantity
      }]);
    } else if (customerContext) {
      setCustomerName(customerContext.customerName || '');
      setAddress(customerContext.address || '');
      setPhoneNumber(customerContext.phoneNumber || '');
      setTransportMode(customerContext.transportMode || 'Keep at Shop');
      setNote(customerContext.note || '');
      setAdvancePaid('');
      setIsFullPaymentReceived(false);

      if (customerContext.batchName) {
        const parts = parseBatchName(customerContext.batchName);
        if (parts) {
          setBYear(parts.year);
          setBMonth(parts.month);
          setBNumber(parts.number);
        }
      }
    } else {
      if (existingBatches.length > 0) {
        const sortedBatches = [...existingBatches].sort().reverse(); 
        const latest = sortedBatches[0];
        const parts = parseBatchName(latest);
        if (parts) {
           setBYear(parts.year);
           setBMonth(parts.month);
           setBNumber(parts.number);
        }
      }
    }
  }, [initialData, customerContext, existingBatches]);

  useEffect(() => {
    let totalSell = 0;
    let totalQty = 0;
    items.forEach(item => {
      const base = item.basePrice === '' ? 0 : item.basePrice;
      const sellPrice = base + FIXED_CHARGE;
      totalSell += sellPrice * item.quantity;
      totalQty += item.quantity;
    });
    const advance = advancePaid === '' ? 0 : advancePaid;
    let remaining = 0;
    if (!isFullPaymentReceived) {
      remaining = Math.max(0, totalSell - advance);
    }
    setTotals({
      totalSellingPrice: totalSell,
      totalQuantity: totalQty,
      remainingBalance: remaining
    });
  }, [items, advancePaid, isFullPaymentReceived]);

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), productName: '', basePrice: '', quantity: 1 }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numericAdvance = advancePaid === '' ? 0 : advancePaid;
    const commonData = {
      batchName: fullBatchName,
      customerName,
      address,
      phoneNumber,
      transportMode,
      note: note && note.trim() ? note.trim() : undefined,
      isFullPaymentReceived
    };

    const evenlyDistributedAdvance = isFullPaymentReceived
      ? items.map(() => 0)
      : distributeAdvanceAcrossItems(numericAdvance, items.length);

    const ordersToCreate: OrderFormData[] = items.map((item, index) => {
      const base = item.basePrice === '' ? 0 : item.basePrice;
      const sellingPrice = base + FIXED_CHARGE;
      const itemTotal = sellingPrice * item.quantity;

      let itemAdvance = evenlyDistributedAdvance[index] ?? 0;

      if (isFullPaymentReceived) {
        itemAdvance = itemTotal;
      }

      return {
        ...commonData,
        productName: item.productName,
        sellingPrice,
        quantity: item.quantity,
        advancePaid: itemAdvance
      };
    });

    if (isMultiItem || items.length > 1) {
      onSubmit(ordersToCreate as any); 
    } else {
      onSubmit(ordersToCreate[0]);
    }
  };

  const inputClasses = "w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none transition-all bg-white text-slate-900 placeholder-slate-400";
  const selectClasses = "w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-rose-500 outline-none bg-white text-slate-900";

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
           <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Batch Management</h3>
           <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">Batch ID Builder</label>
             <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-500 px-2">BATCH -</div>
                
                <div className="flex-1 w-full sm:w-auto">
                    <select value={bYear} onChange={(e) => setBYear(e.target.value)} className={selectClasses}>
                        <option value="2024">2024</option>
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                    </select>
                </div>

                <div className="flex-1 w-full sm:w-auto">
                    <select value={bMonth} onChange={(e) => setBMonth(e.target.value)} className={selectClasses}>
                        {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <div className="font-bold text-slate-500 px-1">-</div>

                <div className="flex-1 w-full sm:w-auto">
                    <select value={bNumber} onChange={(e) => setBNumber(e.target.value)} className={selectClasses}>
                        {Array.from({length: 15}, (_, i) => String(i + 1).padStart(2, '0')).map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
             </div>
             <p className="text-xs text-slate-500 mt-2 text-right">
                 Generated ID: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{fullBatchName}</span>
             </p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Customer Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClasses}
                  />
              </div>

               <div className="pt-2">
                 <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${isMultiItem ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={isMultiItem}
                      onChange={(e) => setIsMultiItem(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex items-center gap-2">
                      <Layers size={18} className={isMultiItem ? "text-indigo-600" : "text-slate-400"} />
                      <span className={`text-sm font-medium ${isMultiItem ? "text-indigo-900" : "text-slate-600"}`}>
                        Same Customer (Multiple Items)
                      </span>
                    </div>
                  </label>
               </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">
              {isMultiItem ? 'Items List' : 'Item Details'}
            </h3>
            
            <div className="space-y-6 flex-1">
               {items.map((item, index) => (
                 <div key={item.id} className={`relative ${index > 0 ? 'pt-6 border-t border-slate-100' : ''}`}>
                    {items.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => handleRemoveItem(item.id)}
                        className="absolute -top-3 right-0 p-1.5 bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) => handleItemChange(item.id, 'productName', e.target.value)}
                          className={inputClasses}
                          placeholder="e.g. Red Summer Dress"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Base Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400">BTN</span>
                            <input
                              type="number"
                              min="0"
                              value={item.basePrice}
                              onChange={(e) => handleItemChange(item.id, 'basePrice', e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className={`${inputClasses} pl-12`}
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">+ {FIXED_CHARGE} Fixed</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)}
                            className={inputClasses}
                          />
                        </div>
                      </div>
                    </div>
                 </div>
               ))}
               
               {isMultiItem && (
                 <button 
                   type="button" 
                   onClick={handleAddItem}
                   className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 font-medium hover:border-rose-400 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
                 >
                   <Plus size={18} /> Add Another Item
                 </button>
               )}
            </div>
            
            <div className="mt-6 bg-slate-900 text-white p-4 rounded-lg shadow-md">
               <div className="flex justify-between items-center mb-1">
                 <span className="text-sm text-slate-300">Total Quantity:</span>
                 <span className="font-bold">{totals.totalQuantity}</span>
               </div>
               <div className="flex justify-between items-center text-lg">
                 <span className="font-bold text-slate-200">Total Selling Price:</span>
                 <span className="font-bold text-emerald-400">
                   BTN {totals.totalSellingPrice.toFixed(2)}
                 </span>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Payment & Delivery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mode of Transport</label>
                <select
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as TransportMode)}
                  className={inputClasses}
                >
                  {TRANSPORT_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClasses}
                  rows={2}
                  placeholder="e.g. Leave at front door, specific delivery instructions..."
                />
              </div>
            </div>

             <div className="space-y-4">
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                   {isMultiItem ? "Total Advance for All Items" : "Advance Paid by Customer"}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">BTN</span>
                  <input
                    type="number"
                    min="0"
                    value={advancePaid}
                    onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className={`${inputClasses} pl-12`}
                  />
                </div>
              </div>
                <div className="flex items-center pt-2">
                  <label className={`flex items-center p-3 border rounded-lg cursor-pointer w-full transition-all ${isFullPaymentReceived ? 'bg-emerald-50 border-emerald-200' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                  <input
                    type="checkbox"
                    checked={isFullPaymentReceived}
                    onChange={(e) => setIsFullPaymentReceived(e.target.checked)}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-slate-900">Mark as Fully Paid</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col items-end">
             <div className="text-right space-y-1 text-sm text-slate-600">
               <p>Grand Total: BTN {(totals.totalSellingPrice).toFixed(2)}</p>
               <p>- Advance: BTN {Number(advancePaid).toFixed(2)}</p>
             </div>
             <div className="mt-2 flex items-center gap-3">
               <span className="text-lg font-bold text-slate-800">Remaining Balance:</span>
               <span className={`text-2xl font-bold ${totals.remainingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                 BTN {totals.remainingBalance.toFixed(2)}
               </span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-4 sticky bottom-4 z-10 -mx-4 md:mx-0 px-4 md:px-0 bg-white md:bg-transparent border-t border-slate-200 md:border-0 py-4 md:py-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 shadow-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-[2] px-6 py-3 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all flex justify-center items-center gap-2"
          >
            <Save size={20} />
            {initialData ? 'Update Order' : `Save ${items.length > 1 ? `All ${items.length} Orders` : 'Order'}`}
          </button>
        </div>

      </form>
    </div>
  );
};
