import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ArrowRight, MapPin, Store } from 'lucide-react';
import { apiRequest, formatCurrency } from '../services/api';
import type { Order } from '../types';

export function OrderConfirmationPage() {
  const { reference } = useParams<{ reference: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    setLoading(true);
    apiRequest<{ order: Order }>(`/api/orders/${encodeURIComponent(reference)}`)
      .then((res) => setOrder(res.order))
      .catch((err: any) => setError(err.message || 'Unable to load order confirmation.'))
      .finally(() => setLoading(false));
  }, [reference]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[#64748B]">
        Loading order receipt...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8">
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Order unavailable
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">{error || 'Order not found.'}</p>
          <Link
            to="/orders"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#0F172A] text-white text-sm font-semibold"
          >
            View My Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE5DC]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-[#10B981]/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-[#059669]" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#059669]">
                Order Received
              </p>
              <h1 className="font-editorial text-3xl font-semibold text-[#0F172A] mt-0.5">
                Thank you, {order.customerName}
              </h1>
              <p className="text-sm text-[#64748B] mt-1">
                Reference{' '}
                <span className="font-bold text-[#0F172A] tabular-nums">
                  {order.orderReference}
                </span>{' '}
                · Placed {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold uppercase tracking-wider self-start">
            <Clock className="w-3.5 h-3.5" />
            {order.status}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-1">
              Fulfillment
            </p>
            <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
              {order.fulfillmentType === 'DELIVERY' ? (
                <>
                  <MapPin className="w-4 h-4 text-[#E05A36]" />
                  <span>Delivery</span>
                </>
              ) : (
                <>
                  <Store className="w-4 h-4 text-[#E05A36]" />
                  <span>Host Stand Collection</span>
                </>
              )}
            </div>
            <p className="text-xs text-[#475569] mt-1">
              {order.fulfillmentType === 'DELIVERY'
                ? order.deliveryAddress
                : 'Savoria Flagship Dining Room · 420 Mercer Street'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-1">
              Payment Status
            </p>
            <p className="font-semibold text-[#0F172A]">
              {order.paymentMethod === 'PAYSTACK' ? 'Paystack Checkout' : 'Pay on Collection'}
            </p>
            <p className="text-xs text-[#059669] font-semibold mt-1">
              {order.paymentStatus === 'PAID_PAYSTACK'
                ? 'Paid & Verified via Paystack'
                : order.paymentStatus === 'PAID_ON_COLLECTION'
                ? 'Paid at Host Stand'
                : order.paymentStatus === 'PENDING_COLLECTION'
                ? 'Pay at Host Stand on Collection'
                : order.paymentStatus}
            </p>
            {order.paymentReference && (
              <p className="text-[11px] text-[#64748B] mt-1 tabular-nums">
                Ref: {order.paymentReference}
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A] mb-3">
            Itemized Receipt
          </h2>
          <ul className="divide-y divide-[#EAE5DC] border-t border-b border-[#EAE5DC]">
            {order.items.map((item) => (
              <li key={item.id} className="py-3 flex justify-between text-sm">
                <span>
                  <span className="font-semibold text-[#0F172A] tabular-nums">
                    {item.quantity}×
                  </span>{' '}
                  {item.itemName}{' '}
                  <span className="text-xs text-[#64748B] tabular-nums">
                    ({formatCurrency(item.unitPriceCents)} ea)
                  </span>
                </span>
                <span className="font-semibold text-[#0F172A] tabular-nums">
                  {formatCurrency(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-[#475569]">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(order.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-[#475569]">
              <span>Delivery Fee</span>
              <span className="tabular-nums">
                {order.deliveryFeeCents === 0
                  ? 'Complimentary'
                  : formatCurrency(order.deliveryFeeCents)}
              </span>
            </div>
            <div className="flex justify-between text-[#475569]">
              <span>Tax</span>
              <span className="tabular-nums">{formatCurrency(order.taxCents)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-[#0F172A] pt-2 border-t border-[#EAE5DC]">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(order.totalCents)}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 flex flex-wrap gap-3 justify-between">
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-semibold transition-colors"
          >
            <span>Track My Orders</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white border border-[#EAE5DC] hover:bg-[#F5F2EB] text-[#0F172A] text-sm font-semibold transition-colors"
          >
            <span>Order More Dishes</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
