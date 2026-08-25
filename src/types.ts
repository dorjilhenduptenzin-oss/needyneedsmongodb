
export type TransportMode = 'Bus' | 'Taxi' | 'Post' | 'Keep at Shop';

export interface Order {
  id: string;
  groupId?: string; // Links multiple items from the same order session
  createdAt: number;
  
  // Batch Info
  batchName: string;

  // Customer Info
  customerName: string;
  address: string;
  phoneNumber: string;

  // Order Info
  productName: string;
  sellingPrice: number;  // "Price customer pays" (Base + 150)
  quantity: number;

  // Financials
  advancePaid: number;   // Amount paid in advance (distributed if multi-item)
  transportMode: TransportMode;
  note?: string;         // Optional notes about the order

  // Status
  isFullPaymentReceived: boolean;
  version?: number;
}

export type OrderFormData = Omit<Order, 'id' | 'createdAt'>;

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalOutstanding: number;
  netRevenue: number; // Revenue - Expenses
}

export interface BatchCost {
  batchName: string;
  totalCostPrice: number;
  oatInputValue: number; // Quantity for Oat payment
  deliveryFeeQuantity?: number; // Manual override for delivery fee quantity
  isPacked?: boolean;
  packedAt?: string | null;
  version?: number;
}

export interface BatchSummary {
  batchName: string;
  orderCount: number;
  totalItems: number;
  
  // Income
  totalSales: number;
  
  // Expenses
  deliveryFee: number;        // (deliveryFeeQty OR Items) * 100
  oatPayment: number;         // OatInput * 28
  totalCostPrice: number;     // Manual Input
  
  // Result
  netProfit: number;          // Sales - (All Expenses)
  
  monthYear: string; // "YYYY-MM" for grouping

  // Meta for UI
  oatInputValue: number;
  deliveryFeeQuantity: number;
  isPacked?: boolean;
  packedAt?: string | null;
}

export interface CustomerTrend {
  phoneNumber: string;
  customerName: string;
  primaryAddress: string;
  totalOrders: number;
  
  // Financials
  totalSales: number;
  
  // Breakdown
  totalCostPrice: number;
  totalOat: number;
  totalDelivery: number;

  netProfit: number;
  lastOrderDate: number;
}
