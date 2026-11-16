export type UserRole = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  defaultAddress: string;
  authProvider: string;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  itemCount?: number;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  dietaryTags: string[];
  prepTimeMins: number;
  isAvailable: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Preparing'
  | 'Ready'
  | 'Completed'
  | 'Cancelled';

export type FulfillmentType = 'DELIVERY' | 'COLLECTION';
export type PaymentMethod = 'PAYSTACK' | 'PAY_ON_COLLECTION';
export type PaymentStatus =
  | 'PAID_PAYSTACK'
  | 'PAID_ON_COLLECTION'
  | 'PENDING_PAYMENT'
  | 'PENDING_COLLECTION'
  | 'FAILED'
  | 'REFUNDED';

export interface PaymentGatewayConfig {
  provider: 'PAYSTACK';
  paystackConfigured: boolean;
  publicKey: string | null;
  currency: string;
}

export interface PaystackInitResponse {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  verificationToken: string;
  amountCents: number;
  currency: string;
  publicKey: string | null;
  expiresAt: string;
}

export interface OrderItemRecord {
  id: number;
  menuItemId: number;
  itemName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Order {
  id: number;
  orderReference: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  orderNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  status: OrderStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
}

export interface AdminStats {
  totalOrders: number;
  activeOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenueCents: number;
  totalCustomers: number;
  totalMenuItems: number;
  availableMenuItems: number;
}

export interface CustomerSummary {
  id: number;
  name: string;
  email: string;
  phone: string;
  defaultAddress: string;
  authProvider: string;
  isActive: boolean;
  role: UserRole;
  orderCount: number;
  totalSpentCents: number;
  createdAt: string;
}
