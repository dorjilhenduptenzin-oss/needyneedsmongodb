
import { Order, BatchCost } from '../types';

export interface SummaryEntry {
  month: string;
  batches: string;
  totalSales: number;
  costPrice: number | null;
  deliveryFee: number | null;
  oatPayment: number | null;
  fixedExpense: number | null;
  netProfit: number | null;
  isBatchClosed: boolean;
  savedAt: string;
}

declare const importMetaEnv: any;
const API_BASE: string = (typeof importMetaEnv !== 'undefined' && importMetaEnv.VITE_API_BASE) || (typeof process !== 'undefined' && process.env.VITE_API_BASE) || '/api';

const normalizeOrder = (item: any): Order => ({
  id: String(item.orderId || item.id || ''),
  groupId: item.groupId || '',
  createdAt: Number(item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
  batchName: String(item.batchName || ''),
  customerName: String(item.customerName || ''),
  address: String(item.address || ''),
  phoneNumber: String(item.phoneNumber || ''),
  productName: String(item.productName || ''),
  sellingPrice: Number(item.sellingPrice || 0),
  quantity: Number(item.quantity || 0),
  advancePaid: Number(item.advancePaid || 0),
  transportMode: item.transportMode || 'Keep at Shop',
  note: item.note || undefined,
  isFullPaymentReceived: Boolean(item.isFullPaymentReceived)
});

const normalizeCost = (item: any): BatchCost => ({
  batchName: String(item.batchName || ''),
  totalCostPrice: Number(item.totalCostPrice || 0),
  oatInputValue: Number(item.oatInputValue || 0),
  deliveryFeeQuantity: item.deliveryFeeQuantity !== undefined && item.deliveryFeeQuantity !== null && item.deliveryFeeQuantity !== '' ? Number(item.deliveryFeeQuantity) : undefined,
  isPacked: Boolean(item.isPacked),
  packedAt: item.packedAt ? String(item.packedAt) : null,
  version: Number.isInteger(Number(item.version)) ? Number(item.version) : undefined
});

const parseErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    return payload?.error || payload?.message || fallback;
  } catch {
    return fallback;
  }
};

export const loadDataFromSheets = async () => {
  const [ordersRes, costsRes] = await Promise.all([
    fetch(`${API_BASE}/orders`),
    fetch(`${API_BASE}/batchCosts`)
  ]);

  if (!ordersRes.ok || !costsRes.ok) {
    throw new Error('Unable to load the latest data from the server.');
  }

  const orders = await ordersRes.json();
  const costs = await costsRes.json();

  return {
    orders: (orders || []).map(normalizeOrder),
    batchCosts: (costs || []).map(normalizeCost)
  };
};

export const createOrder = async (order: Order) => {
  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...order, orderId: order.id, id: order.id })
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to create order.'));
  }

  const payload = await response.json();
  return payload.order || order;
};

export const updateOrder = async (order: Order) => {
  const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(order.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...order, orderId: order.id, version: order.version || 1 })
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to update order.'));
  }

  const payload = await response.json();
  return payload.order || order;
};

export const deleteOrder = async (orderId: string) => {
  const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to delete order.'));
  }

  return response.json();
};

export const createBatchCost = async (cost: BatchCost) => {
  const response = await fetch(`${API_BASE}/batchCosts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cost)
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to create batch cost.'));
  }

  const payload = await response.json();
  return payload.batchCost || cost;
};

export const updateBatchCost = async (cost: BatchCost) => {
  const response = await fetch(`${API_BASE}/batchCosts/${encodeURIComponent(cost.batchName)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cost, version: cost.version ?? 1 })
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to update batch cost.'));
  }

  const payload = await response.json();
  return payload.batchCost || cost;
};

export const syncOrdersToSheet = async (orders: Order[]) => {
  if (!orders || !orders.length) {
    return;
  }

  const [firstOrder] = orders;
  if (!firstOrder || !firstOrder.id) {
    return;
  }

  const order = await createOrder(firstOrder);
  return order;
};

export const syncBatchCostsToSheet = async (costs: BatchCost[]) => {
  if (!costs || !costs.length) {
    return;
  }

  const [cost] = costs;
  if (!cost || !cost.batchName) {
    return;
  }

  const created = await createBatchCost(cost);
  return created;
};

export const saveSummaryEntry = async (entry: SummaryEntry) => {
  const response = await fetch(`${API_BASE}/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Unable to save summary.'));
  }

  return response.json();
};

export const upsertSummaryEntry = async (entry: SummaryEntry) => {
  return saveSummaryEntry(entry);
};

export const loadSummaryEntries = async (): Promise<SummaryEntry[]> => {
  const response = await fetch(`${API_BASE}/summary`);
  if (!response.ok) throw new Error('Summary load failed');
  return await response.json();
};
