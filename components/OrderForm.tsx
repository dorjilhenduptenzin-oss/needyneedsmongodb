
import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderFormData, TransportMode } from '../types';
import { TRANSPORT_MODES, FIXED_CHARGE } from '../constants';
import { Save, Plus, Trash2, Layers, AlertTriangle, XCircle, Wallet, ReceiptText, Calculator, Landmark, Coins, Info } from 'lucide-react';
import { distributeAdvanceAcrossItems } from '../utils/advanceDistribution';

interface OrderFormProps {
  initialData?: OrderFormData;
  customerContext?: Partial<Order>;
  existingBatches: string[];
  onSubmit: (data: OrderFormData | OrderFormData[]) => Promise<any> | void;
  onCancel: () => void;
}

interface OrderItem {
  id: string;
  productName: string;
  basePrice: number | '';
  quantity: number | '';
}

export const OrderForm: React.FC<OrderFormProps> = ({ initialData, customerContext, existingBatches, onSubmit, onCancel }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [transportMode, setTransportMode] = useState<TransportMode>('Keep at Shop');
  const [note, setNote] = useState('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [isFullPaymentReceived, setIsFullPaymentReceived] = useState(false);

  const currentYear = new Date().getFullYear().toString();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const batchYears = Array.from({ length: 12 }, (_, index) => String(2024 + index));
  
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
      setNote('');
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
    }
  }, [initialData, customerContext]);

  useEffect(() => {
    let totalSell = 0;
    let totalQty = 0;
    items.forEach(item => {
      const base = item.basePrice === '' ? 0 : item.basePrice;
      const qty = item.quantity === '' ? 0 : item.quantity;
      const sellPrice = base + FIXED_CHARGE;
      totalSell += sellPrice * qty;
      totalQty += qty;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const numericAdvance = advancePaid === '' ? 0 : advancePaid;
    const commonData = {
      batchName: fullBatchName,
      customerName,
      address,
      phoneNumber,
      transportMode,
      note,
      isFullPaymentReceived
    };

    const evenlyDistributedAdvance = isFullPaymentReceived
      ? items.map(() => 0)
      : distributeAdvanceAcrossItems(numericAdvance, items.length);

    const ordersToCreate: OrderFormData[] = items.map((item, index) => {
      const base = item.basePrice === '' ? 0 : item.basePrice;
      const qty = item.quantity === '' ? 1 : item.quantity;
      const sellingPrice = base + FIXED_CHARGE;
      const itemTotal = sellingPrice * qty;

      let itemAdvance = evenlyDistributedAdvance[index] ?? 0;

      if (isFullPaymentReceived) {
        itemAdvance = itemTotal;
      }

      return {
        ...commonData,
        productName: item.productName,
        sellingPrice,
        quantity: qty,
        advancePaid: itemAdvance
      };
    });

    try {
      const payload = (isMultiItem || items.length > 1) ? (ordersToCreate as any) : ordersToCreate[0];
      const maybe = onSubmit(payload as any);
      if (maybe && typeof (maybe as any).then === 'function') {
        await maybe;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClasses = "w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all bg-white text-slate-900 placeholder-slate-400 font-medium";
  const selectClasses = "w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-rose-500 bg-white text-slate-900 font-semibold";
  const labelClasses = "block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2";

  return (
    <div className="max-w-6xl mx-auto pb-40">
      <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
        
        {/* BATCH CARD */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
           <h3 className="text-lg font-bold text-slate-900 mb-6 font-serif">Shipping Batch</h3>
           <div>
             <label className={labelClasses}>Batch Reference</label>
             <div className="flex flex-col sm:flex-row gap-3 items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-400 px-2 shrink-0">BATCH -</div>
                <div className="flex-1 w-full">
                    <select value={bYear} onChange={(e) => setBYear(e.target.value)} className={selectClasses}>
                    {batchYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div className="flex-1 w-full">
                    <select value={bMonth} onChange={(e) => setBMonth(e.target.value)} className={selectClasses}>
                        {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
                <div className="font-bold text-slate-400 px-1 shrink-0">-</div>
                <div className="flex-1 w-full">
                    <select value={bNumber} onChange={(e) => setBNumber(e.target.value)} className={selectClasses}>
                    {Array.from({length: 50}, (_, i) => String(i + 1).padStart(2, '0')).map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
             </div>
             <div className="mt-3 flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
               <Info size={12} /> Multiple orders can be assigned to the same batch.
             </div>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* CUSTOMER CARD */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-6 font-serif">Customer Details</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Full Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClasses} placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Phone Number</label>
                  <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputClasses} placeholder="+975..." />
                </div>
                <div>
                    <label className={labelClasses}>Address</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClasses} placeholder="Location..." />
                </div>
              </div>
               <div className="pt-2">
                 <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${isMultiItem ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                    <input type="checkbox" checked={isMultiItem} onChange={(e) => setIsMultiItem(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                    <div className="ml-4 flex items-center gap-3">
                      <Layers size={20} className={isMultiItem ? "text-indigo-600" : "text-slate-400"} />
                      <div>
                        <span className={`text-sm font-bold ${isMultiItem ? "text-indigo-900" : "text-slate-600"}`}>Multi-Item Purchase</span>
                        <p className="text-xs text-slate-500 font-medium">Add multiple items to this entry</p>
                      </div>
                    </div>
                  </label>
               </div>
            </div>
          </div>

          {/* INVENTORY CARD */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-lg font-bold text-slate-900 mb-6 font-serif">Order Items</h3>
            <div className="space-y-6 flex-1 custom-scrollbar overflow-y-auto pr-1 max-h-[400px]">
               {items.map((item, index) => {
                 const baseVal = item.basePrice === '' ? 0 : item.basePrice;
                 const qtyVal = item.quantity === '' ? 0 : item.quantity;
                 const perItemPrice = baseVal + FIXED_CHARGE;
                 const itemSubtotal = perItemPrice * qtyVal;

                 return (
                   <div key={item.id} className={`relative ${index > 0 ? 'pt-6 border-t border-slate-100' : ''}`}>
                      {items.length > 1 && (
                        <button type="button" onClick={() => handleRemoveItem(item.id)} className="absolute top-0 right-0 p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="space-y-4">
                        <div>
                          <label className={labelClasses}>Product Description</label>
                          <input type="text" value={item.productName} onChange={(e) => handleItemChange(item.id, 'productName', e.target.value)} className={inputClasses} placeholder="Scarf, Dress, etc..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelClasses}>Base Price</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">BTN</span>
                              <input type="number" min="0" value={item.basePrice} onChange={(e) => handleItemChange(item.id, 'basePrice', e.target.value === '' ? '' : parseFloat(e.target.value))} className={`${inputClasses} pl-12 text-base font-bold`} />
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">+ {FIXED_CHARGE} Service Fee</p>
                          </div>
                          <div>
                            <label className={labelClasses}>Quantity</label>
                            <input type="number" min="1" value={item.quantity} onChange={(e) => {
                              const val = e.target.value;
                              handleItemChange(item.id, 'quantity', val === '' ? '' : parseInt(val));
                            }} className={`${inputClasses} text-base font-bold`} />
                          </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                           <div className="font-bold text-slate-400 uppercase tracking-wider">
                              {perItemPrice.toLocaleString()} BTN Unit
                           </div>
                           <div className="font-bold text-slate-900">
                              SUBTOTAL: BTN {itemSubtotal.toLocaleString()}
                           </div>
                        </div>
                      </div>
                   </div>
                 );
               })}
               {(isMultiItem || items.length > 1) && (
                 <button type="button" onClick={handleAddItem} className="w-full py-3 border-2 border-dashed border-slate-100 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:border-rose-200 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
                   <Plus size={16} /> Add Next Item
                 </button>
               )}
            </div>
            
            {/* INVENTORY SUMMARY BOX */}
            <div className="mt-6 bg-slate-900 text-white p-6 rounded-2xl shadow-lg space-y-4">
               <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Quantity</span>
                  <span className="text-xl font-bold">{totals.totalQuantity} Units</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selling Price Total</span>
                  <span className="text-xl font-bold text-indigo-400">BTN {totals.totalSellingPrice.toLocaleString()}</span>
               </div>
            </div>
          </div>
        </div>

        {/* PAYMENT CARD */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6 font-serif">Payment & Logistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className={labelClasses}>Transport Channel</label>
                <select value={transportMode} onChange={(e) => setTransportMode(e.target.value as TransportMode)} className={inputClasses}>
                  {TRANSPORT_MODES.map(mode => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClasses}>Notes</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClasses} py-2`} rows={2} placeholder="Any specific instructions..." />
              </div>
            </div>

             <div className="space-y-6">
               <div>
                <label className={labelClasses}>Advance Deposit</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">BTN</span>
                  <input type="number" min="0" value={advancePaid} onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : parseFloat(e.target.value))} className={`${inputClasses} pl-12 text-base font-bold`} />
                </div>
              </div>
                <div className="flex items-center">
                  <label className={`flex items-center p-4 border rounded-xl cursor-pointer w-full transition-all ${isFullPaymentReceived ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                  <input type="checkbox" checked={isFullPaymentReceived} onChange={(e) => setIsFullPaymentReceived(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500" />
                  <div className="ml-4">
                    <span className="block text-sm font-bold text-slate-900">Mark as Fully Paid</span>
                    <p className="text-[10px] text-slate-500 font-medium">Clear all remaining dues</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* FINANCIAL SUMMARY SECTION */}
          <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grand Total</span>
                <span className="text-xl font-bold text-slate-900">BTN {totals.totalSellingPrice.toLocaleString()}</span>
             </div>
             <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Advance Paid</span>
                <span className="text-xl font-bold text-emerald-600">BTN {(advancePaid || 0).toLocaleString()}</span>
             </div>
             <div className={`p-5 rounded-2xl border flex flex-col gap-1 shadow-sm transition-all duration-300 ${totals.remainingBalance > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-600 border-emerald-500 text-white'}`}>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${totals.remainingBalance > 0 ? 'text-rose-400' : 'text-emerald-100'}`}>Balance Due</span>
                <span className="text-xl font-bold">BTN {totals.remainingBalance.toLocaleString()}</span>
             </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-4 pt-4 sticky bottom-6 z-10 bg-slate-50/80 backdrop-blur-sm md:bg-transparent pb-4 md:pb-0">
          <button type="button" onClick={onCancel} className="flex-1 px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all shadow-sm">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className={`flex-[2] px-6 py-3 rounded-xl bg-rose-600 text-white font-bold uppercase tracking-widest text-[10px] ${isSubmitting ? 'opacity-60 pointer-events-none' : 'hover:bg-rose-700 active:scale-[0.98]'} transition-all shadow-lg shadow-rose-200 flex justify-center items-center gap-3`}>
            <Save size={18} />
            {initialData ? 'Update Record' : 'Save Order Entry'}
          </button>
        </div>

      </form>
    </div>
  );
};
