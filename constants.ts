
export const APP_NAME = "Needy Needs";
export const BUILD_VERSION = "4.6.0";

export const DELIVERY_FEE_PER_ITEM = 100;
export const OAT_RATE = 28;
export const FIXED_CHARGE = 150;
export const FIXED_HOUSE_EXPENSE = 30000;

export const TRANSPORT_MODES = [
  'Bus',
  'Taxi',
  'Post',
  'Keep at Shop'
] as const;

export const APP_VIEWS = {
  DASHBOARD: 'dashboard',
  NEW_ORDER: 'new_order',
  ORDER_LIST: 'order_list',
  BATCH_ANALYTICS: 'batch_analytics',
  NET_REVENUE: 'net_revenue',
  CUSTOMERS: 'customers'
} as const;

export type AppView = typeof APP_VIEWS[keyof typeof APP_VIEWS];
