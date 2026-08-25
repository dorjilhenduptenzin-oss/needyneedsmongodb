
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutDashboard, PlusCircle, List, Menu, X, PieChart, Loader2, RefreshCw, CloudOff, Cloud, TrendingUp } from 'lucide-react';
import { Order, OrderFormData, BatchCost } from './types';
import { APP_VIEWS, AppView, APP_NAME, BUILD_VERSION } from './constants';
import { 
  loadDataFromSheets,
  createOrder,
  updateOrder,
  deleteOrder,
  createBatchCost,
  updateBatchCost,
  saveSummaryEntry
} from './services/storage';
import { Dashboard } from './components/Dashboard';
import { OrderForm } from './components/OrderForm';
import { OrderList } from './components/OrderList';
import { BatchAnalytics } from './components/BatchAnalytics';
import { NetRevenue } from './components/NetRevenue';

const generateId = () => {
  try {
    return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2));
  } catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
};

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(APP_VIEWS.DASHBOARD);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batchCosts, setBatchCosts] = useState<BatchCost[]>([]);

  const ordersRef = useRef<Order[]>([]);
  const costsRef = useRef<BatchCost[]>([]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [customerContext, setCustomerContext] = useState<Partial<Order> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [batchToEditInAnalytics, setBatchToEditInAnalytics] = useState<string | null>(null);

  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { costsRef.current = batchCosts; }, [batchCosts]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setSyncError(null);
      try {
        const data = await loadDataFromSheets();
        if (data.orders) setOrders(data.orders);
        if (data.batchCosts) setBatchCosts(data.batchCosts);
      } catch (err: any) {
        console.error("Initial load failed:", err);
        setSyncError(err?.message || 'Unable to connect to the server.');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const triggerCloudSync = useCallback(async (_currentOrders: Order[], _currentCosts: BatchCost[]) => {
    return;
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      setSyncError(null);
      setSyncMessage(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [orders, batchCosts, isLoading]);

  const refreshData = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const data = await loadDataFromSheets();
      if (data.orders) setOrders(data.orders);
      if (data.batchCosts) setBatchCosts(data.batchCosts);
    } catch (err: any) {
      setSyncError(err?.message || 'Unable to connect to the server. Your changes have not been saved.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateOrUpdateOrder = async (data: OrderFormData | OrderFormData[]) => {
    try {
      setIsSyncing(true);
      setSyncError(null);

      const items = Array.isArray(data) ? data : [data];
      const saveResults: Order[] = [];

      for (const item of items) {
        const order: Order = {
          ...item,
          id: editingOrder?.id || generateId(),
          createdAt: editingOrder?.createdAt || Date.now(),
          groupId: editingOrder?.groupId || generateId(),
          version: editingOrder?.version || 1
        } as Order;

        const persisted = editingOrder ? await updateOrder(order) : await createOrder(order);
        saveResults.push(persisted as Order);
      }

      setOrders(prev => {
        let next = [...prev];
        if (editingOrder) {
          const eid = String(editingOrder.id).trim();
          next = next.map(o => String(o.id).trim() === eid ? saveResults[0] : o);
        } else {
          next = [...saveResults, ...next];
        }
        return next;
      });

      setEditingOrder(null);
      setCustomerContext(null);
      setCurrentView(APP_VIEWS.ORDER_LIST);
      setSyncMessage(editingOrder ? 'Order updated successfully' : 'Order saved successfully');
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to save order. The change has not been confirmed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteOrder = async (idOrIds: string | string[]) => {
    const idsToKill = Array.isArray(idOrIds) 
      ? idOrIds.map(id => String(id).trim()) 
      : [String(idOrIds).trim()];

    try {
      setIsSyncing(true);
      setSyncError(null);

      // Optimistic UI update: remove locally first so app reflects deletion immediately
      const killSet = new Set(idsToKill);
      setOrders(prev => prev.filter(order => !killSet.has(String(order.id).trim())));

      // Perform deletes; if any fail we'll refresh from server
      for (const id of idsToKill) {
        try {
          await deleteOrder(id);
        } catch (e) {
          console.error('Delete failed for', id, e);
          // refresh to ensure client matches server
          await refreshData();
          throw e;
        }
      }
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to delete order. The change has not been confirmed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkUpdateOrders = (updatedList: Order[]) => {
    setOrders(prev => {
      const updates = new Map(updatedList.map(o => [String(o.id).trim(), o]));
      return prev.map(o => updates.has(String(o.id).trim()) ? updates.get(String(o.id).trim())! : o);
    });
  };

  const handleMoveCustomerOrders = async (ordersToMove: Order[], targetBatch: string) => {
    if (!ordersToMove.length || !targetBatch || !targetBatch.trim()) {
      return;
    }

    try {
      setIsSyncing(true);
      setSyncError(null);

      // Optimistic update: apply the batch change immediately in UI
      const updatedOrders: Order[] = ordersToMove.map(o => ({ ...o, batchName: targetBatch.trim(), version: (o.version || 1) + 1 }));
      const updatesMap = new Map(updatedOrders.map(o => [String(o.id).trim(), o]));
      setOrders(prev => prev.map(o => updatesMap.has(String(o.id).trim()) ? updatesMap.get(String(o.id).trim())! : o));

      // Send updates to server; on failure refresh from server to reconcile
      for (const order of updatedOrders) {
        try {
          await updateOrder(order);
        } catch (e) {
          console.error('Move failed for', order.id, e);
          await refreshData();
          throw e;
        }
      }
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to move the customer orders to the new batch.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateBatchCost = async (cost: BatchCost) => {
    try {
      setIsSyncing(true);
      setSyncError(null);
      const persisted = await updateBatchCost(cost);
      setBatchCosts(prev => {
        const next = [...prev];
        const idx = next.findIndex(c => c.batchName === cost.batchName);
        if (idx >= 0) next[idx] = persisted as BatchCost; else next.push(persisted as BatchCost);
        return next;
      });
      setSyncMessage('Batch cost updated successfully');
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to save batch cost. The change has not been confirmed.');
    } finally {
      setIsSyncing(false);
      setBatchToEditInAnalytics(null);
    }
  };

  const NavItem = ({ view, icon: Icon, label }: { view: any, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setEditingOrder(null);
        setCustomerContext(null);
        setBatchToEditInAnalytics(null);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center gap-3 w-full px-5 py-3.5 rounded-xl transition-all duration-200 font-semibold text-sm ${currentView === view ? 'bg-slate-900 text-white shadow-xl shadow-slate-200 translate-x-1' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
    >
      <Icon size={18} className={currentView === view ? 'text-rose-500' : ''} />
      <span>{label}</span>
    </button>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="animate-spin h-10 w-10 text-slate-900 mb-6" />
        <div className="text-center">
            <h1 className="font-serif text-2xl font-bold text-slate-900 tracking-tight">{APP_NAME}</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-2">Connecting to Secure Cloud</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col md:flex-row print:bg-white relative">
      <aside className={`fixed inset-0 z-40 bg-slate-50 md:static md:w-80 md:h-screen border-r border-slate-100 p-8 flex flex-col transition-transform duration-300 ease-in-out print:hidden ${isMobileMenuOpen ? 'translate-x-0 pt-24' : '-translate-x-full md:translate-x-0'}`}>
        
        <div className="hidden md:flex flex-col gap-0.5 mb-14 px-1">
           <span className="font-serif text-3xl font-bold text-slate-900 tracking-tight leading-none">NeedyNeeds</span>
           <span className="text-[10px] uppercase tracking-[0.3em] font-extrabold text-slate-400 mt-1">Inventory Management</span>
        </div>
        
        <nav className="space-y-1.5 flex-1">
          <NavItem view={APP_VIEWS.DASHBOARD} icon={LayoutDashboard} label="Dashboard" />
          <NavItem view={APP_VIEWS.NEW_ORDER} icon={PlusCircle} label="New Order" />
          <NavItem view={APP_VIEWS.ORDER_LIST} icon={List} label="All Orders" />
          <NavItem view={APP_VIEWS.BATCH_ANALYTICS} icon={PieChart} label="Financial Reports" />
          <NavItem view={APP_VIEWS.NET_REVENUE} icon={TrendingUp} label="Net Revenue" />
        </nav>
        
        <div className="mt-auto pt-8 border-t border-slate-200/60 space-y-5">
           <div className="px-5 py-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
               <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connectivity</span>
                    <div className={`w-2 h-2 rounded-full ${syncError ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'}`} />
               </div>
               {isSyncing ? (
                 <div className="text-slate-900 font-bold text-xs flex items-center gap-2">
                   <RefreshCw className="animate-spin" size={12} /> Syncing...
                 </div>
               ) : (
                 <div className={`font-bold text-xs flex items-center gap-2 ${syncError ? 'text-rose-600' : 'text-slate-900'}`}>
                     {syncError ? <CloudOff size={14} /> : <Cloud size={14} />}
                     {syncError ? (syncError.length > 60 ? syncError.substring(0,57) + '...' : syncError) : (syncMessage ? syncMessage : 'Live MongoDB')}
                   </div>
               )}
           </div>

           <button onClick={refreshData} className="w-full flex items-center justify-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:text-slate-900 transition-colors py-2 group">
             <RefreshCw size={12} className="group-hover:rotate-180 transition-transform duration-500" /> Full System Sync
           </button>
           
           <div className="text-[9px] text-slate-300 text-center uppercase tracking-[0.3em] font-black opacity-60">
             Build {BUILD_VERSION}
           </div>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 lg:p-14 overflow-y-auto h-screen print:h-auto print:overflow-visible text-slate-900 custom-scrollbar">
        <header className="mb-12 flex justify-between items-start print:hidden">
          <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1.5">
                Authorized Access Repository
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 font-serif tracking-tight">
                {currentView === APP_VIEWS.DASHBOARD && 'Strategic Overview'}
                {currentView === APP_VIEWS.NEW_ORDER && (editingOrder ? 'Modify Entry' : 'Create Transaction')}
                {currentView === APP_VIEWS.ORDER_LIST && 'Inventory Database'}
                {currentView === APP_VIEWS.BATCH_ANALYTICS && 'Performance Analytics'}
                {currentView === APP_VIEWS.NET_REVENUE && 'Net Revenue Analysis'}
              </h1>
          </div>
          <button className="md:hidden p-3 bg-white shadow-sm border border-slate-100 rounded-xl text-slate-900" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        <div className="print:w-full">
          {currentView === APP_VIEWS.DASHBOARD && <Dashboard orders={orders} batchCosts={batchCosts} />}
          {currentView === APP_VIEWS.NEW_ORDER && <OrderForm initialData={editingOrder || undefined} customerContext={customerContext || undefined} existingBatches={Array.from(new Set(orders.map(o => o.batchName)))} onSubmit={handleCreateOrUpdateOrder} onCancel={() => { 
            if (editingOrder || customerContext) {
              setCurrentView(APP_VIEWS.ORDER_LIST);
            } else {
              setCurrentView(APP_VIEWS.DASHBOARD);
            }
            setEditingOrder(null); 
            setCustomerContext(null); 
          }} />}
          {currentView === APP_VIEWS.ORDER_LIST && <OrderList orders={orders} batchCosts={batchCosts} onDelete={handleDeleteOrder} onEdit={(o) => { setEditingOrder(o); setCurrentView(APP_VIEWS.NEW_ORDER); }} onAddMore={(o) => { setCustomerContext(o); setCurrentView(APP_VIEWS.NEW_ORDER); }} onEditBatchCost={(batchName) => { setBatchToEditInAnalytics(batchName); setCurrentView(APP_VIEWS.BATCH_ANALYTICS); }} onUpdateOrders={handleBulkUpdateOrders} onMoveCustomerOrders={handleMoveCustomerOrders} />}
          {currentView === APP_VIEWS.BATCH_ANALYTICS && <BatchAnalytics orders={orders} batchCosts={batchCosts} onUpdateBatchCost={handleUpdateBatchCost} initialEditBatch={batchToEditInAnalytics} />}
          {currentView === APP_VIEWS.NET_REVENUE && <NetRevenue orders={orders} batchCosts={batchCosts} />}
        </div>
      </main>
    </div>
  );
}
