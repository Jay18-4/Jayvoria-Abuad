import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, ChefHat, PackageCheck, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatCurrency } from '../services/api';
import type { Order, OrderStatus } from '../types';

const PROGRESS_STEPS: OrderStatus[] = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];

export function getStatusBadgeClasses(status: OrderStatus) {
  switch (status) {
    case 'Pending':
      return 'bg-[#FEF3C7] text-[#92400E]';
    case 'Confirmed':
    case 'Preparing':
    case 'Ready':
      return 'bg-[#FFEDD5] text-[#9A3412]';
    case 'Completed':
      return 'bg-[#D1FAE5] text-[#065F46]';
    case 'Cancelled':
      return 'bg-[#FEE2E2] text-[#991B1B]';
  }
}

export function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ orders: Order[] }>('/api/orders');
      setOrders(res.orders);
      if (res.orders.length > 0 && expandedId === null) {
        setExpandedId(res.orders[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load your order history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadOrders();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-sm text-[#64748B]">
        Loading your orders...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 text-center shadow-card-rest">
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Sign in to view your orders
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Track live kitchen status and review past dining receipts in your personal order history.
          </p>
          <Link
            to="/login?redirect=/orders"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled');
  const pastOrders = orders.filter((o) => o.status === 'Completed' || o.status === 'Cancelled');

  const renderOrderCard = (order: Order) => {
    const isExpanded = expandedId === order.id;
    const stepIndex = PROGRESS_STEPS.indexOf(order.status);

    return (
      <article
        key={order.id}
        className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest"
      >
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-bold text-base text-[#0F172A] tabular-nums">
                {order.orderReference}
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusBadgeClasses(
                  order.status
                )}`}
              >
                {order.status}
              </span>
              <span className="text-xs text-[#64748B]">
                {order.fulfillmentType === 'DELIVERY' ? 'Courier Delivery' : 'Collection'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Placed {new Date(order.createdAt).toLocaleString()} · {order.items.length}{' '}
              {order.items.length === 1 ? 'dish' : 'dishes'}
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4">
            <span className="text-lg font-bold text-[#0F172A] tabular-nums">
              {formatCurrency(order.totalCents)}
            </span>
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : order.id)}
              aria-expanded={isExpanded}
              aria-label={`Toggle details for order ${order.orderReference}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5DC] text-xs font-semibold text-[#0F172A] transition-colors"
            >
              <span>{isExpanded ? 'Hide Details' : 'Order Details'}</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Live Status Progress Bar for active orders */}
        {order.status !== 'Cancelled' && (
          <div className="px-5 sm:px-6 pb-5">
            <div className="grid grid-cols-5 gap-2">
              {PROGRESS_STEPS.map((step, idx) => {
                const reached = stepIndex >= idx;
                return (
                  <div key={step} className="space-y-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-colors ${
                        reached ? 'bg-[#E05A36]' : 'bg-[#EAE5DC]'
                      }`}
                    />
                    <p
                      className={`text-[11px] font-semibold truncate ${
                        reached ? 'text-[#0F172A]' : 'text-[#94A3B8]'
                      }`}
                    >
                      {step}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="px-5 sm:px-6 py-5 bg-[#FAF8F5] border-t border-[#EAE5DC] space-y-4">
            <ul className="divide-y divide-[#EAE5DC]">
              {order.items.map((it) => (
                <li key={it.id} className="py-2 flex justify-between text-sm">
                  <span>
                    <strong className="tabular-nums">{it.quantity}×</strong> {it.itemName}{' '}
                    <span className="text-xs text-[#64748B] tabular-nums">
                      ({formatCurrency(it.unitPriceCents)} each)
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(it.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#475569] pt-2 border-t border-[#EAE5DC]">
              <div>
                <p className="font-semibold text-[#0F172A]">Fulfillment Details</p>
                <p className="mt-1">
                  {order.fulfillmentType === 'DELIVERY'
                    ? `Delivering to: ${order.deliveryAddress}`
                    : 'Host Stand Collection · 420 Mercer Street'}
                </p>
                <p className="mt-1">
                  Payment:{' '}
                  {order.paymentMethod === 'PAYSTACK'
                    ? `Paystack (${order.paymentStatus})`
                    : `Pay on Collection (${order.paymentStatus})`}
                  {order.paymentReference ? ` · Ref: ${order.paymentReference}` : ''}
                </p>
                {order.orderNotes && <p className="mt-1 italic">Note: {order.orderNotes}</p>}
              </div>
              <div className="sm:text-right space-y-1">
                <p>Subtotal: {formatCurrency(order.subtotalCents)}</p>
                <p>
                  Delivery:{' '}
                  {order.deliveryFeeCents === 0
                    ? 'Complimentary'
                    : formatCurrency(order.deliveryFeeCents)}
                </p>
                <p>Tax: {formatCurrency(order.taxCents)}</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  Total: {formatCurrency(order.totalCents)}
                </p>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#0F172A]">
            My Orders
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Monitor live kitchen progress and review your previous receipts.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOrders}
          className="px-4 py-2 rounded-full bg-white border border-[#EAE5DC] hover:bg-[#F5F2EB] text-xs font-semibold text-[#0F172A] self-start"
        >
          Refresh Status
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-12 text-center">
          <ChefHat className="w-10 h-10 text-[#8C716A] mx-auto mb-3" />
          <h2 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            No orders placed yet
          </h2>
          <p className="mt-2 text-sm text-[#64748B]">
            Once you place an order from our menu, you can follow it live right here.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
          >
            Browse Menu
          </Link>
        </div>
      ) : (
        <>
          {activeOrders.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-editorial text-xl font-semibold text-[#0F172A] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#E05A36]" />
                <span>Active Orders ({activeOrders.length})</span>
              </h2>
              <div className="space-y-4">{activeOrders.map(renderOrderCard)}</div>
            </section>
          )}

          {pastOrders.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-editorial text-xl font-semibold text-[#0F172A] flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#059669]" />
                <span>Order History ({pastOrders.length})</span>
              </h2>
              <div className="space-y-4">{pastOrders.map(renderOrderCard)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
