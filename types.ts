
export type TransportMode = 'Bus' | 'Taxi' | 'Post' | 'Keep at Shop';

export interface Order {
  id: string;
  groupId?: string;
  createdAt: number;
  batchName: string;
  customerName: string;
  address: string;
  phoneNumber: string;
  productName: string;
  sellingPrice: number;
  quantity: number;
  advancePaid: number;
  transportMode: TransportMode;
  note?: string;
  isFullPaymentReceived: boolean;
  version?: number;
}

export type OrderFormData = Omit<Order, 'id' | 'createdAt'>;

export interface BatchCost {
  batchName: string;
  totalCostPrice: number;
  oatInputValue: number;
  deliveryFeeQuantity?: number;
  isPacked?: boolean;
  packedAt?: string | null;
  version?: number;
}

export interface BatchSummary {
  batchName: string;
  orderCount: number;
  totalItems: number;
  totalSales: number;
  deliveryFee: number;
  oatPayment: number;
  totalCostPrice: number;
  netProfit: number;
  monthYear: string;
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
  totalSales: number;
  totalCostPrice: number;
  totalOat: number;
  totalDelivery: number;
  netProfit: number;
  lastOrderDate: number;
}
