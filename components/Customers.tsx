import React, { useMemo, useState } from 'react';
import { Order } from '../types';
import { Users, Search, Download, ChevronDown, ChevronRight, ArrowUpDown, AlertTriangle, CalendarClock, Crown, Repeat, Sparkles, UserPlus, Clock } from 'lucide-react';

interface CustomersProps {
  orders: Order[];
  onViewCustomerOrders?: (search: string) => void;
}

type Segment = 'Champion' | 'Loyal' | 'Big spender' | 'At risk' | 'New' | 'One-time' | 'Occasional';

interface MonthStat { billed: number; units: number; orders: number; }

interface CustomerRow {
  key: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  totalUnits: number;
  totalBilled: number;      // sum of sellingPrice * quantity  (NO payment status involved)
  avgOrderValue: number;
  billedPerUnit: number;
  biggestOrder: number;
  firstOrder: number;
  lastOrder: number;
  months: string[];         // sorted YYYY-MM
  byMonth: Record<string, MonthStat>;
  segment: Segment;
}

const DAY = 86400000;
const btn = (n: number) => `BTN ${Math.round(n).toLocaleString()}`;
const monthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' });
};
const percentile = (sortedAsc: number[], p: number) => {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
};

const SEGMENT_STYLE: Record<Segment, { cls: string; icon: React.ReactNode }> = {
  'Champion':    { cls: 'bg-indigo-100 text-indigo-700 border-indigo-200',   icon: <Crown size={11} /> },
  'Loyal':       { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <Repeat size={11} /> },
  'Big spender': { cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <Sparkles size={11} /> },
  'At risk':     { cls: 'bg-rose-100 text-rose-700 border-rose-200',          icon: <Clock size={11} /> },
  'New':         { cls: 'bg-sky-100 text-sky-700 border-sky-200',             icon: <UserPlus size={11} /> },
  'One-time':    { cls: 'bg-slate-100 text-slate-600 border-slate-200',       icon: null },
  'Occasional':  { cls: 'bg-slate-100 text-slate-600 border-slate-200',       icon: null },
};

type SortKey = 'totalBilled' | 'totalUnits' | 'avgOrderValue' | 'orderCount' | 'lastOrder';

export const Customers: React.FC<CustomersProps> = ({ orders, onViewCustomerOrders }) => {
  const [search, setSearch] = useState('');
  const [segFilter, setSegFilter] = useState<'all' | Segment>('all');
  const [sortKey, setSortKey] = useState<SortKey>('totalBilled');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showMonths, setShowMonths] = useState(false);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [showDupes, setShowDupes] = useState(false);

  const { rows, summary, monthly, followUps, dupes, asOf } = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    let maxTs = 0;

    for (const o of orders) {
      const name = (o.customerName || '').trim();
      const phone = (o.phoneNumber || '').trim();
      if (!name && !phone) continue;
      const key = `${name.toLowerCase()}_${phone}`;
      const billed = (Number(o.sellingPrice) || 0) * (Number(o.quantity) || 0);
      const qty = Number(o.quantity) || 0;
      const ts = Number(o.createdAt) || Date.now();
      if (ts > maxTs) maxTs = ts;
      const mk = monthKey(ts);

      let row = map.get(key);
      if (!row) {
        row = {
          key, name: name || '(no name)', phone: phone || '—', address: o.address || '',
          orderCount: 0, totalUnits: 0, totalBilled: 0, avgOrderValue: 0, billedPerUnit: 0,
          biggestOrder: 0, firstOrder: ts, lastOrder: ts, months: [], byMonth: {}, segment: 'Occasional',
        };
        map.set(key, row);
      }
      row.orderCount += 1;
      row.totalUnits += qty;
      row.totalBilled += billed;
      row.biggestOrder = Math.max(row.biggestOrder, billed);
      row.firstOrder = Math.min(row.firstOrder, ts);
      row.lastOrder = Math.max(row.lastOrder, ts);
      const ms = row.byMonth[mk] || (row.byMonth[mk] = { billed: 0, units: 0, orders: 0 });
      ms.billed += billed; ms.units += qty; ms.orders += 1;
    }

    const now = Math.max(maxTs, Date.now() - 365 * DAY); // measure recency from the latest order date
    const all = Array.from(map.values());
    for (const r of all) {
      r.avgOrderValue = r.orderCount ? r.totalBilled / r.orderCount : 0;
      r.billedPerUnit = r.totalUnits ? r.totalBilled / r.totalUnits : 0;
      r.months = Object.keys(r.byMonth).sort();
    }

    const spendP80 = percentile(all.map(r => r.totalBilled).sort((a, b) => a - b), 0.8);
    const aovP80 = percentile(all.map(r => r.avgOrderValue).sort((a, b) => a - b), 0.8);

    for (const r of all) {
      const recencyDays = (now - r.lastOrder) / DAY;
      let seg: Segment;
      if (r.orderCount === 1) {
        seg = recencyDays <= 60 ? 'New' : 'One-time';
      } else if (r.totalBilled >= spendP80 && r.orderCount >= 3 && recencyDays <= 90) {
        seg = 'Champion';
      } else if (r.orderCount >= 3 && recencyDays > 120) {
        seg = 'At risk';
      } else if (r.orderCount >= 3 && recencyDays <= 120) {
        seg = 'Loyal';
      } else if (r.avgOrderValue >= aovP80) {
        seg = 'Big spender';
      } else {
        seg = 'Occasional';
      }
      r.segment = seg;
    }

    // summary
    const grand = all.reduce((s, r) => s + r.totalBilled, 0);
    const totalOrders = all.reduce((s, r) => s + r.orderCount, 0);
    const repeat = all.filter(r => r.orderCount >= 2).length;
    const top10 = [...all].sort((a, b) => b.totalBilled - a.totalBilled).slice(0, 10)
      .reduce((s, r) => s + r.totalBilled, 0);
    const summary = {
      customers: all.length,
      repeatRate: all.length ? repeat / all.length : 0,
      top10Share: grand ? top10 / grand : 0,
      avgOrderValue: totalOrders ? grand / totalOrders : 0,
      grand,
    };

    // monthly rollup: unique / new / returning customers + billed per month
    const seenBefore = new Set<string>();
    const monthAgg: Record<string, { customers: Set<string>; newCust: number; billed: number; units: number }> = {};
    const chrono = [...orders].filter(o => (o.customerName || o.phoneNumber))
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    for (const o of chrono) {
      const key = `${(o.customerName || '').trim().toLowerCase()}_${(o.phoneNumber || '').trim()}`;
      const mk = monthKey(Number(o.createdAt) || Date.now());
      const agg = monthAgg[mk] || (monthAgg[mk] = { customers: new Set(), newCust: 0, billed: 0, units: 0 });
      if (!seenBefore.has(key)) { seenBefore.add(key); agg.newCust += 1; }
      agg.customers.add(key);
      agg.billed += (Number(o.sellingPrice) || 0) * (Number(o.quantity) || 0);
      agg.units += Number(o.quantity) || 0;
    }
    const monthly = Object.entries(monthAgg).sort((a, b) => b[0].localeCompare(a[0])).map(([mk, a]) => ({
      month: mk, customers: a.customers.size, newCust: a.newCust,
      returning: a.customers.size - a.newCust, billed: a.billed, units: a.units,
    }));

    // due for follow-up: 3+ orders and overdue vs their own average gap
    const followUps = all
      .filter(r => r.orderCount >= 3)
      .map(r => {
        const avgGap = (r.lastOrder - r.firstOrder) / (r.orderCount - 1) / DAY;
        const sinceLast = (now - r.lastOrder) / DAY;
        return { r, avgGap, sinceLast, ratio: avgGap > 0 ? sinceLast / avgGap : 0 };
      })
      .filter(x => x.ratio >= 1.5 && x.sinceLast >= 21)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 20);

    // possible duplicates: one phone -> several name keys, or one name -> several phones
    const byPhone = new Map<string, Set<string>>();
    const byName = new Map<string, Set<string>>();
    for (const r of all) {
      if (r.phone && r.phone !== '—') {
        (byPhone.get(r.phone) || byPhone.set(r.phone, new Set()).get(r.phone)!).add(r.name);
      }
      const n = r.name.toLowerCase();
      (byName.get(n) || byName.set(n, new Set()).get(n)!).add(r.phone);
    }
    const dupes: { kind: 'phone' | 'name'; value: string; variants: string[] }[] = [];
    byPhone.forEach((names, phone) => { if (names.size > 1) dupes.push({ kind: 'phone', value: phone, variants: [...names] }); });
    byName.forEach((phones, name) => { if (phones.size > 1) dupes.push({ kind: 'name', value: name, variants: [...phones] }); });

    const rows = all.sort((a, b) => b.totalBilled - a.totalBilled);
    return { rows, summary, monthly, followUps, dupes, asOf: now };
  }, [orders]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows;
    if (segFilter !== 'all') r = r.filter(x => x.segment === segFilter);
    if (q) r = r.filter(x => x.name.toLowerCase().includes(q) || x.phone.includes(search.trim()));
    return [...r].sort((a, b) => {
      if (sortKey === 'lastOrder') return b.lastOrder - a.lastOrder;
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [rows, search, segFilter, sortKey]);

  const segCounts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach(r => { c[r.segment] = (c[r.segment] || 0) + 1; });
    return c;
  }, [rows]);

  const exportCsv = () => {
    const head = ['Customer', 'Phone', 'Segment', 'Orders', 'Units', 'Billed (BTN)', 'Avg order (BTN)', 'Billed / unit', 'Biggest order', 'First order', 'Last order', 'Months active'];
    const lines = rows.map(r => [
      r.name, r.phone, r.segment, r.orderCount, r.totalUnits, Math.round(r.totalBilled),
      Math.round(r.avgOrderValue), Math.round(r.billedPerUnit), Math.round(r.biggestOrder),
      new Date(r.firstOrder).toISOString().slice(0, 10), new Date(r.lastOrder).toISOString().slice(0, 10),
      r.months.length,
    ].map(v => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const csv = [head.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NeedyNeeds_Customers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const relDays = (ts: number) => {
    const d = Math.round((asOf - ts) / DAY);
    if (d <= 0) return 'latest';
    if (d < 31) return `${d}d ago`;
    if (d < 365) return `${Math.round(d / 30)}mo ago`;
    return `${(d / 365).toFixed(1)}y ago`;
  };

  const sortBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${sortKey === key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {label}{sortKey === key && <ArrowUpDown size={11} />}
    </button>
  );

  const Spark = ({ months, byMonth }: { months: string[]; byMonth: Record<string, MonthStat> }) => {
    if (months.length < 2) return null;
    const vals = months.map(m => byMonth[m].billed);
    const max = Math.max(...vals, 1);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${28 - (v / max) * 24}`).join(' ');
    return (
      <svg width="90" height="30" viewBox="0 0 100 30" preserveAspectRatio="none" className="text-indigo-400">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">

      {/* summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customers</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{summary.customers.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-1">name + phone, all time</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Repeat rate</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{(summary.repeatRate * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-slate-400 mt-1">ordered 2+ times</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Top 10 share</p>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{(summary.top10Share * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-slate-400 mt-1">of all billed value</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg order</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{btn(summary.avgOrderValue)}</p>
          <p className="text-[10px] text-slate-400 mt-1">billed ÷ orders</p>
        </div>
      </div>

      {/* controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer or phone…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-rose-500 transition-all bg-white text-slate-900 placeholder-slate-400 text-sm"
          />
        </div>
        <button onClick={exportCsv} className="shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-black transition-colors text-[10px] font-bold uppercase tracking-widest">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* segment chips */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSegFilter('all')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${segFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
          All · {rows.length}
        </button>
        {(['Champion', 'Loyal', 'Big spender', 'At risk', 'New', 'One-time', 'Occasional'] as Segment[])
          .filter(s => segCounts[s])
          .map(s => (
            <button key={s} onClick={() => setSegFilter(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors inline-flex items-center gap-1.5 ${segFilter === s ? 'bg-slate-900 text-white border-slate-900' : `${SEGMENT_STYLE[s].cls} hover:brightness-95`}`}>
              {SEGMENT_STYLE[s].icon}{s} · {segCounts[s]}
            </button>
          ))}
      </div>

      {/* table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.6fr_0.9fr_0.6fr_0.6fr_0.9fr_0.9fr_0.8fr] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Segment</span>
          <span className="text-right">{sortBtn('orderCount', 'Orders')}</span>
          <span className="text-right">{sortBtn('totalUnits', 'Units')}</span>
          <span className="text-right">{sortBtn('totalBilled', 'Billed')}</span>
          <span className="text-right">{sortBtn('avgOrderValue', 'Avg order')}</span>
          <span className="text-right">{sortBtn('lastOrder', 'Last')}</span>
        </div>

        {visibleRows.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm font-medium">No customers match.</div>
        )}

        <div className="divide-y divide-slate-50">
          {visibleRows.slice(0, 300).map(r => {
            const open = expanded === r.key;
            return (
              <div key={r.key}>
                <button
                  onClick={() => setExpanded(open ? null : r.key)}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50/60 transition-colors grid grid-cols-[1fr_auto] md:grid-cols-[1.6fr_0.9fr_0.6fr_0.6fr_0.9fr_0.9fr_0.8fr] gap-3 items-center"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {open ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                      <span className="font-bold text-slate-900 text-sm truncate">{r.name}</span>
                    </span>
                    <span className="block text-[11px] text-slate-400 font-medium mt-0.5 ml-6">{r.phone}</span>
                  </span>
                  <span className="md:hidden text-right font-bold text-slate-900 text-sm">{btn(r.totalBilled)}</span>
                  <span className="hidden md:inline">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-full border ${SEGMENT_STYLE[r.segment].cls}`}>
                      {SEGMENT_STYLE[r.segment].icon}{r.segment}
                    </span>
                  </span>
                  <span className="hidden md:block text-right text-sm text-slate-600 font-semibold">{r.orderCount}</span>
                  <span className="hidden md:block text-right text-sm text-slate-600 font-semibold">{r.totalUnits}</span>
                  <span className="hidden md:block text-right text-sm font-bold text-slate-900">{btn(r.totalBilled)}</span>
                  <span className="hidden md:block text-right text-sm text-indigo-600 font-bold">{btn(r.avgOrderValue)}</span>
                  <span className="hidden md:block text-right text-[11px] text-slate-400 font-semibold">{relDays(r.lastOrder)}</span>
                </button>

                {open && (
                  <div className="px-5 pb-5 pt-1 bg-slate-50/40">
                    <div className="md:hidden flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500 font-medium mb-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SEGMENT_STYLE[r.segment].cls}`}>{r.segment}</span>
                      <span>{r.orderCount} orders</span><span>{r.totalUnits} units</span>
                      <span>Avg {btn(r.avgOrderValue)}</span><span>Biggest {btn(r.biggestOrder)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month-by-month (billed value)</p>
                      <Spark months={r.months} byMonth={r.byMonth} />
                    </div>
                    <div className="rounded-lg border border-slate-100 overflow-hidden bg-white">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-50">
                          {[...r.months].reverse().map(m => (
                            <tr key={m}>
                              <td className="px-4 py-2 text-slate-600 font-medium">{monthLabel(m)}</td>
                              <td className="px-4 py-2 text-right text-slate-500">{r.byMonth[m].orders} ord</td>
                              <td className="px-4 py-2 text-right text-slate-500">{r.byMonth[m].units} units</td>
                              <td className="px-4 py-2 text-right font-bold text-slate-900">{btn(r.byMonth[m].billed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {onViewCustomerOrders && (
                      <button
                        onClick={() => onViewCustomerOrders(r.phone !== '—' ? r.phone : r.name)}
                        className="mt-3 text-[11px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        View this customer's orders →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {visibleRows.length > 300 && (
          <div className="px-5 py-3 text-center text-[11px] text-slate-400 font-semibold border-t border-slate-100">
            Showing top 300 of {visibleRows.length}. Narrow with search or a segment, or export the full list.
          </div>
        )}
      </div>

      {/* --- monthly rollup --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <button onClick={() => setShowMonths(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors">
          <span className="flex items-center gap-2 font-bold text-slate-900 text-sm"><CalendarClock size={16} className="text-slate-400" /> Customers by month</span>
          {showMonths ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </button>
        {showMonths && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customers</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">New</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Returning</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Units</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.map(m => (
                  <tr key={m.month} className="hover:bg-slate-50/40">
                    <td className="px-5 py-2.5 font-semibold text-slate-700">{monthLabel(m.month)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{m.customers}</td>
                    <td className="px-4 py-2.5 text-right text-sky-600 font-semibold">{m.newCust}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{m.returning}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{m.units}</td>
                    <td className="px-5 py-2.5 text-right font-bold text-slate-900">{btn(m.billed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- follow-ups --- */}
      {followUps.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <button onClick={() => setShowFollowUps(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors">
            <span className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Clock size={16} className="text-rose-400" /> Due for a follow-up
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5">{followUps.length}</span>
            </span>
            {showFollowUps ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>
          {showFollowUps && (
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              <p className="px-5 py-2.5 text-[11px] text-slate-400 font-medium">Regular customers who have gone quiet for longer than their usual gap between orders.</p>
              {followUps.map(({ r, avgGap, sinceLast }) => (
                <div key={r.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{r.name}</p>
                    <p className="text-[11px] text-slate-400 font-medium">{r.phone} · {r.orderCount} orders · usually every ~{Math.round(avgGap)}d</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold text-rose-600">{Math.round(sinceLast)}d silent</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- duplicates --- */}
      {dupes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <button onClick={() => setShowDupes(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors">
            <span className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <AlertTriangle size={16} className="text-amber-500" /> Possible duplicate customers
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">{dupes.length}</span>
            </span>
            {showDupes ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>
          {showDupes && (
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              <p className="px-5 py-2.5 text-[11px] text-slate-400 font-medium">The same person may be split across these — totals above count them separately.</p>
              {dupes.slice(0, 40).map((d, i) => (
                <div key={i} className="px-5 py-3 text-sm">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{d.kind === 'phone' ? 'Same phone' : 'Same name'}</span>
                  <span className="block font-semibold text-slate-800 mt-0.5">{d.value}</span>
                  <span className="block text-[12px] text-slate-500 mt-0.5">{d.kind === 'phone' ? 'names: ' : 'phones: '}{d.variants.join('  ·  ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center font-medium pt-2">
        "Billed" is selling price × quantity — it does not track advance, pending or paid status.
        Recency is measured from your most recent order date.
      </p>
    </div>
  );
};
