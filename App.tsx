
import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { LayoutDashboard, PlusCircle, List, Menu, X, PieChart, Loader2, RefreshCw, CloudOff, Cloud, TrendingUp, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { Order, OrderFormData, BatchCost } from './types';
import { APP_VIEWS, AppView, APP_NAME, BUILD_VERSION } from './constants';
import {
  loadDataFromSheets,
  fetchOrdersPage,
  ORDERS_PAGE_SIZE,
  createOrder,
  updateOrder,
  deleteOrder,
  createBatchCost,
  loadBatchCosts,
  updateBatchCost,
  saveSummaryEntry
} from './services/storage';

// Route views are code-split so the initial bundle stays small; recharts
// (Dashboard) and jsPDF (Financial Reports) only download when first opened.
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const OrderForm = lazy(() => import('./components/OrderForm').then(m => ({ default: m.OrderForm })));
const OrderList = lazy(() => import('./components/OrderList').then(m => ({ default: m.OrderList })));
const BatchAnalytics = lazy(() => import('./components/BatchAnalytics').then(m => ({ default: m.BatchAnalytics })));
const NetRevenue = lazy(() => import('./components/NetRevenue').then(m => ({ default: m.NetRevenue })));
const Customers = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));

const ViewFallback = () => (
  <div className="flex items-center justify-center py-24 text-slate-400">
    <Loader2 className="animate-spin h-6 w-6" />
  </div>
);

type ToastKind = 'success' | 'error' | 'working';

// One status toast, fixed to the viewport so it is visible on every screen
// size (the sidebar it used to live in is off-canvas on mobile).
const StatusToast = ({ kind, text, onDismiss }: { kind: ToastKind; text: string; onDismiss?: () => void }) => {
  const theme = {
    success: { bar: 'bg-emerald-500', icon: <CheckCircle2 className="text-emerald-600" size={18} /> },
    error:   { bar: 'bg-rose-500',    icon: <AlertTriangle className="text-rose-600" size={18} /> },
    working: { bar: 'bg-slate-400',   icon: <Loader2 className="animate-spin text-slate-500" size={18} /> },
  }[kind];

  return (
    <div className="fixed z-[60] top-4 left-4 right-4 md:left-auto md:right-6 md:w-96 print:hidden" role="status" aria-live="polite">
      <div className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white pl-4 pr-3 py-3 shadow-card animate-toast-in">
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${theme.bar}`} />
        <span className="shrink-0 mt-0.5">{theme.icon}</span>
        <p className="flex-1 text-sm font-semibold leading-snug text-slate-800">{text}</p>
        {onDismiss && (
          <button onClick={onDismiss} className="shrink-0 -m-1 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-900" aria-label="Dismiss">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

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
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [bgFilling, setBgFilling] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [batchToEditInAnalytics, setBatchToEditInAnalytics] = useState<string | null>(null);
  const [customerFocusSearch, setCustomerFocusSearch] = useState<string | null>(null);

  // Bumped on every full (re)load so a superseded background fill can bail out.
  const loadTokenRef = useRef(0);

  useEffect(() => { ordersRef.current = orders; }, [orders]);
  useEffect(() => { costsRef.current = batchCosts; }, [batchCosts]);

  // Pull the remaining order pages in the background. Accumulate into a local
  // array and replace `orders` with the running total each round, so we never
  // depend on the previous React state (which batching / StrictMode can make
  // stale) and never double-count.
  const loadRemainingOrders = useCallback(async (token: number, firstPage: Order[]) => {
    const acc: Order[] = Array.isArray(firstPage) ? [...firstPage] : [];
    const seen = new Set(acc.map(o => String(o.id).trim()));
    let skip = ORDERS_PAGE_SIZE;

    for (let guard = 0; guard < 500; guard++) {
      // Retry a page a few times so one transient network blip doesn't
      // silently leave the dataset partial.
      let page: Order[] | null = null;
      for (let attempt = 0; attempt < 3 && page === null; attempt++) {
        if (token !== loadTokenRef.current) return; // superseded by a newer load
        try {
          page = await fetchOrdersPage(skip);
        } catch {
          await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
        }
      }
      if (page === null) return;                        // gave up on this page
      if (token !== loadTokenRef.current) return;       // superseded
      if (page.length > ORDERS_PAGE_SIZE) return;       // server not paginating; already have everything

      let added = 0;
      for (const o of page) {
        const id = String(o.id).trim();
        if (!seen.has(id)) { seen.add(id); acc.push(o); added++; }
      }
      setOrders(acc.slice());

      if (page.length < ORDERS_PAGE_SIZE || added === 0) return; // reached the end
      skip += ORDERS_PAGE_SIZE;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setSyncError(null);
      const token = ++loadTokenRef.current;
      try {
        const data = await loadDataFromSheets();
        if (token !== loadTokenRef.current) return;
        if (data.orders) setOrders(data.orders);
        if (data.batchCosts) setBatchCosts(data.batchCosts);
        if (!data.ordersComplete) {
          setBgFilling(true);
          void loadRemainingOrders(token, data.orders).finally(() => setBgFilling(false));
        }
      } catch (err: any) {
        console.error("Initial load failed:", err);
        setSyncError(err?.message || 'Unable to connect to the server.');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadRemainingOrders]);

  const triggerCloudSync = useCallback(async (_currentOrders: Order[], _currentCosts: BatchCost[]) => {
    return;
  }, []);

  // Auto-dismiss the transient success message so it is actually readable
  // (previously a 0ms timer keyed on data changes cleared it immediately).
  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  // Clear a stale error banner after a while so it does not linger forever.
  useEffect(() => {
    if (!syncError) return;
    const timer = setTimeout(() => setSyncError(null), 8000);
    return () => clearTimeout(timer);
  }, [syncError]);

  const refreshData = async () => {
    setIsSyncing(true);
    setBusyLabel('Syncing with server…');
    setSyncError(null);
    const token = ++loadTokenRef.current;
    try {
      const data = await loadDataFromSheets();
      if (token !== loadTokenRef.current) return;
      if (data.orders) setOrders(data.orders);
      if (data.batchCosts) setBatchCosts(data.batchCosts);
      if (!data.ordersComplete) {
        setBgFilling(true);
        void loadRemainingOrders(token, data.orders).finally(() => setBgFilling(false));
      }
      setSyncMessage('Data refreshed');
    } catch (err: any) {
      setSyncError(err?.message || 'Unable to connect to the server. Your changes have not been saved.');
    } finally {
      setIsSyncing(false);
      setBusyLabel(null);
    }
  };

  const handleCreateOrUpdateOrder = async (data: OrderFormData | OrderFormData[]) => {
    try {
      setIsSyncing(true);
      setBusyLabel(editingOrder ? 'Updating order…' : 'Saving order…');
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
      setSyncMessage(editingOrder ? 'Order updated' : (items.length > 1 ? `${items.length} orders saved` : 'Order saved'));
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to save order. The change has not been confirmed.');
    } finally {
      setIsSyncing(false);
      setBusyLabel(null);
    }
  };

  const handleDeleteOrder = async (idOrIds: string | string[]) => {
    const idsToKill = Array.isArray(idOrIds) 
      ? idOrIds.map(id => String(id).trim()) 
      : [String(idOrIds).trim()];

    try {
      setIsSyncing(true);
      setBusyLabel(idsToKill.length > 1 ? 'Deleting orders…' : 'Deleting order…');
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
      setSyncMessage(idsToKill.length > 1 ? `${idsToKill.length} orders deleted` : 'Order deleted');
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to delete order. The change has not been confirmed.');
    } finally {
      setIsSyncing(false);
      setBusyLabel(null);
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
      setBusyLabel('Moving orders…');
      setSyncError(null);

      // Optimistic update: apply the batch change immediately in UI (show incremented version locally)
      const updatedOrdersForUI: Order[] = ordersToMove.map(o => ({ ...o, batchName: targetBatch.trim(), version: (o.version || 1) + 1 }));
      const updatesMap = new Map(updatedOrdersForUI.map(o => [String(o.id).trim(), o]));
      setOrders(prev => prev.map(o => updatesMap.has(String(o.id).trim()) ? updatesMap.get(String(o.id).trim())! : o));

      // Send updates to server using the current server version (do NOT send incremented version)
      for (const originalOrder of ordersToMove) {
        const payloadOrder: Order = { ...originalOrder, batchName: targetBatch.trim(), version: originalOrder.version || 1 };
        try {
          await updateOrder(payloadOrder);
        } catch (e) {
          console.error('Move failed for', originalOrder.id, e);
          await refreshData();
          throw e;
        }
      }
      setSyncMessage(`Moved to ${targetBatch.trim()}`);
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to move the customer orders to the new batch.');
    } finally {
      setIsSyncing(false);
      setBusyLabel(null);
    }
  };

  const handleUpdateBatchCost = async (cost: BatchCost) => {
    try {
      setIsSyncing(true);
      setBusyLabel('Saving batch cost…');
      setSyncError(null);

      let persisted: BatchCost | null = null;
      try {
        persisted = await updateBatchCost(cost);
      } catch (err: any) {
        const msg = (err && err.message) ? String(err.message) : String(err || '');
        // If server reports not found, attempt to create instead
        if (msg.toLowerCase().includes('not found')) {
          persisted = await createBatchCost(cost);
        } else {
          throw err;
        }
      }

      if (persisted) {
        // Update local cache and then refresh from server to ensure version consistency
        setBatchCosts(prev => {
          const next = [...prev];
          const idx = next.findIndex(c => c.batchName === cost.batchName);
          if (idx >= 0) next[idx] = persisted as BatchCost; else next.push(persisted as BatchCost);
          return next;
        });

        try {
          const fresh = await loadBatchCosts();
          setBatchCosts(fresh);
        } catch (e) {
          // If refresh fails, keep optimistic update but log
          console.error('Failed to refresh batch costs after save', e);
        }

        setSyncMessage('Batch cost saved');
      }
    } catch (error: any) {
      setSyncError(error?.message || 'Unable to save batch cost. The change has not been confirmed.');
      throw error; // let the modal know the save failed
    } finally {
      setIsSyncing(false);
      setBusyLabel(null);
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
        setCustomerFocusSearch(null);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center gap-3 w-full px-5 py-3.5 rounded-xl transition-all duration-200 font-semibold text-sm ${currentView === view ? 'bg-slate-900 text-white shadow-xl shadow-slate-200 translate-x-1' : 'text-slate-500 hover:bg-white hover:text-slate-900 hover:translate-x-0.5'}`}
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

      {/* top progress bar — immediate "something is happening" feedback */}
      {(isSyncing || bgFilling) && (
        <div className="fixed top-0 left-0 right-0 h-[3px] z-[70] overflow-hidden bg-rose-100 print:hidden">
          <div className="h-full w-1/3 bg-rose-500 animate-progress" />
        </div>
      )}

      {/* status toast — visible on every screen size */}
      {syncError ? (
        <StatusToast kind="error" text={syncError} onDismiss={() => setSyncError(null)} />
      ) : syncMessage ? (
        <StatusToast kind="success" text={syncMessage} onDismiss={() => setSyncMessage(null)} />
      ) : isSyncing ? (
        <StatusToast kind="working" text={busyLabel ?? 'Working…'} />
      ) : null}

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
          <NavItem view={APP_VIEWS.CUSTOMERS} icon={Users} label="Customers" />
        </nav>
        
        <div className="mt-auto pt-8 border-t border-slate-200/60 space-y-5">
           <div className="px-5 py-4 rounded-2xl bg-white border border-slate-100 shadow-card">
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
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
                Authorized Access Repository
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 font-serif tracking-tight">
                {currentView === APP_VIEWS.DASHBOARD && 'Strategic Overview'}
                {currentView === APP_VIEWS.NEW_ORDER && (editingOrder ? 'Modify Entry' : 'Create Transaction')}
                {currentView === APP_VIEWS.ORDER_LIST && 'Inventory Database'}
                {currentView === APP_VIEWS.BATCH_ANALYTICS && 'Performance Analytics'}
                {currentView === APP_VIEWS.NET_REVENUE && 'Net Revenue Analysis'}
                {currentView === APP_VIEWS.CUSTOMERS && 'Customer Analytics'}
              </h1>
          </div>
          <button className="md:hidden p-3 bg-white shadow-card border border-slate-100 rounded-xl text-slate-900" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        <div className="print:w-full">
          <Suspense fallback={<ViewFallback />}>
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
          {currentView === APP_VIEWS.ORDER_LIST && <OrderList orders={orders} batchCosts={batchCosts} isBackgroundLoading={bgFilling} initialSearch={customerFocusSearch} onDelete={handleDeleteOrder} onEdit={(o) => { setEditingOrder(o); setCurrentView(APP_VIEWS.NEW_ORDER); }} onAddMore={(o) => { setCustomerContext(o); setCurrentView(APP_VIEWS.NEW_ORDER); }} onEditBatchCost={(batchName) => { setBatchToEditInAnalytics(batchName); setCurrentView(APP_VIEWS.BATCH_ANALYTICS); }} onUpdateOrders={handleBulkUpdateOrders} onMoveCustomerOrders={handleMoveCustomerOrders} />}
          {currentView === APP_VIEWS.BATCH_ANALYTICS && <BatchAnalytics orders={orders} batchCosts={batchCosts} onUpdateBatchCost={handleUpdateBatchCost} initialEditBatch={batchToEditInAnalytics} />}
          {currentView === APP_VIEWS.NET_REVENUE && <NetRevenue orders={orders} batchCosts={batchCosts} />}
          {currentView === APP_VIEWS.CUSTOMERS && <Customers orders={orders} onViewCustomerOrders={(s) => { setCustomerFocusSearch(s); setCurrentView(APP_VIEWS.ORDER_LIST); }} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
