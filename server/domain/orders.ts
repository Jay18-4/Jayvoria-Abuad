export const ORDER_STATUSES = [
  'Pending',
  'Confirmed',
  'Preparing',
  'Ready',
  'Completed',
  'Cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type FulfillmentType = 'DELIVERY' | 'COLLECTION';
export type PaymentMethod = 'PAYSTACK' | 'PAY_ON_COLLECTION';

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  if (current === next) return false;
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function getAllowedNextStatuses(current: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

export interface PricedLineInput {
  unitPriceCents: number;
  quantity: number;
}

export interface OrderTotals {
  subtotalCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  totalCents: number;
}

export const DELIVERY_FEE_CENTS = 550000;
export const FREE_DELIVERY_THRESHOLD_CENTS = 8500000;
export const TAX_RATE = 0.08;

export function calculateOrderTotals(
  items: PricedLineInput[],
  fulfillmentType: FulfillmentType
): OrderTotals {
  if (!items.length) {
    throw new Error('Cannot calculate totals for an empty order.');
  }

  let subtotalCents = 0;
  for (const item of items) {
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents <= 0) {
      throw new Error('Invalid item price.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
      throw new Error('Invalid item quantity.');
    }
    subtotalCents += item.unitPriceCents * item.quantity;
  }

  const deliveryFeeCents =
    fulfillmentType === 'DELIVERY' && subtotalCents < FREE_DELIVERY_THRESHOLD_CENTS
      ? DELIVERY_FEE_CENTS
      : 0;

  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + deliveryFeeCents + taxCents;

  return {
    subtotalCents,
    deliveryFeeCents,
    taxCents,
    totalCents,
  };
}

export function generateOrderReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SAV-${suffix}`;
}

export function formatCents(cents: number): string {
  return `₦${(cents / 100).toFixed(2)}`;
}
