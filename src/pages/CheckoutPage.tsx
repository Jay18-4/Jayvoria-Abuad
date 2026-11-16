import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Truck,
  Store,
  ShieldCheck,
  ArrowLeft,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  DELIVERY_FEE_KOBO,
  formatCurrency,
  FREE_DELIVERY_THRESHOLD_KOBO,
} from '../services/api';
import { paymentService, type PaystackOrderDraft } from '../services/paymentService';
import { PaystackButton } from '../components/PaystackButton';
import type {
  FulfillmentType,
  Order,
  PaymentGatewayConfig,
  PaymentMethod,
} from '../types';

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, subtotalCents, clearCart } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAYSTACK');
  const [paymentConfig, setPaymentConfig] = useState<PaymentGatewayConfig>({
    provider: 'PAYSTACK',
    paystackConfigured: false,
    publicKey: null,
    currency: 'NGN',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    paymentService
      .getConfig()
      .then((cfg) => {
        setPaymentConfig(cfg);
      })
      .catch(() => {
        // Keep safe defaults if payment config lookup fails
      });
  }, []);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name);
      setCustomerEmail((prev) => prev || user.email);
      setCustomerPhone((prev) => prev || user.phone || '');
      setDeliveryAddress((prev) => prev || user.defaultAddress || '');
    }
  }, [user]);

  useEffect(() => {
    if (fulfillmentType === 'DELIVERY' && paymentMethod === 'PAY_ON_COLLECTION') {
      setPaymentMethod('PAYSTACK');
    }
  }, [fulfillmentType, paymentMethod]);

  // Handle Paystack redirect callback (?reference=... or ?trxref=...)
  useEffect(() => {
    const callbackRef = searchParams.get('reference') || searchParams.get('trxref');
    if (!callbackRef || !user) return;

    const pending = paymentService.readPendingRedirectCheckout();
    if (!pending || pending.reference !== callbackRef) {
      return;
    }

    setSubmitting(true);
    setError(null);
    paymentService
      .verifyAndCreateOrder(pending.draft, callbackRef, pending.verificationToken)
      .then((res) => {
        paymentService.clearPendingRedirectCheckout();
        clearCart();
        showToast(`Payment verified! Order ${res.order.orderReference} confirmed.`, 'success');
        navigate(`/order-confirmation/${res.order.orderReference}`, { replace: true });
      })
      .catch((err: any) => {
        setError(err.message || 'Unable to verify your Paystack payment.');
        setSearchParams({}, { replace: true });
      })
      .finally(() => {
        setSubmitting(false);
      });
  }, [searchParams, user, clearCart, navigate, showToast, setSearchParams]);

  const deliveryFeeCents =
    fulfillmentType === 'DELIVERY' && subtotalCents > 0 && subtotalCents < FREE_DELIVERY_THRESHOLD_KOBO
      ? DELIVERY_FEE_KOBO
      : 0;
  const taxCents = Math.round(subtotalCents * 0.08);
  const totalCents = subtotalCents + deliveryFeeCents + taxCents;

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm text-[#64748B]">
        Verifying your session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 text-center shadow-card-rest">
          <div className="w-12 h-12 rounded-full bg-[#F5F2EB] flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-[#E05A36]" />
          </div>
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Sign in to complete your order
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Your shopping bag is saved. Sign in or create a guest account to submit your order and track its kitchen progress.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/login?redirect=/checkout"
              className="px-6 py-2.5 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register?redirect=/checkout"
              className="px-6 py-2.5 rounded-full bg-white border border-[#EAE5DC] hover:bg-[#F5F2EB] text-[#0F172A] text-sm font-semibold transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest">
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Your bag is currently empty
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Add dishes from the Savoria menu before proceeding to checkout.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
          >
            Return to Menu
          </Link>
        </div>
      </div>
    );
  }

  const buildOrderDraft = (): PaystackOrderDraft => ({
    items: items.map((i) => ({
      menuItemId: i.menuItem.id,
      quantity: i.quantity,
    })),
    customerName,
    customerEmail,
    customerPhone,
    fulfillmentType,
    deliveryAddress: fulfillmentType === 'DELIVERY' ? deliveryAddress : '',
    orderNotes,
  });

  const handlePaystackCheckout = async () => {
    if (formRef.current && !formRef.current.reportValidity()) {
      return;
    }

    setError(null);
    setSubmitting(true);

    const draft = buildOrderDraft();

    try {
      const initialized = await paymentService.initializePaystack(draft);
      paymentService.savePendingRedirectCheckout(
        draft,
        initialized.reference,
        initialized.verificationToken
      );

      await paymentService.openPaystackCheckout({
        accessCode: initialized.accessCode,
        authorizationUrl: initialized.authorizationUrl,
        onSuccess: async (completedReference) => {
          try {
            const verifiedRef = completedReference || initialized.reference;
            const res = await paymentService.verifyAndCreateOrder(
              draft,
              verifiedRef,
              initialized.verificationToken
            );
            paymentService.clearPendingRedirectCheckout();
            clearCart();
            showToast(
              `Paystack payment verified! Order ${res.order.orderReference} confirmed.`,
              'success'
            );
            navigate(`/order-confirmation/${res.order.orderReference}`);
          } catch (verifyErr: any) {
            setError(
              verifyErr.message ||
                'Payment succeeded on Paystack, but server verification failed. Please contact support.'
            );
          } finally {
            setSubmitting(false);
          }
        },
        onCancel: () => {
          paymentService.clearPendingRedirectCheckout();
          setSubmitting(false);
          showToast('Paystack checkout was cancelled. No charge was made.', 'info');
        },
        onError: (msg) => {
          paymentService.clearPendingRedirectCheckout();
          setSubmitting(false);
          setError(msg);
        },
      });
    } catch (err: any) {
      setError(err.message || 'Unable to start Paystack checkout.');
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'PAYSTACK') {
      await handlePaystackCheckout();
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const draft = buildOrderDraft();
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          paymentMethod,
        }),
      });

      clearCart();
      showToast(`Order ${res.order.orderReference} confirmed!`, 'success');
      navigate(`/order-confirmation/${res.order.orderReference}`);
    } catch (err: any) {
      setError(err.message || 'Unable to submit order. Please review your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#64748B] hover:text-[#0F172A] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Menu</span>
      </Link>

      <h1 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#0F172A]">
        Checkout
      </h1>
      <p className="text-sm text-[#64748B] mt-1">
        Confirm your fulfillment preferences and review your culinary selection.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Form Columns */}
        <div className="lg:col-span-7 space-y-6">
          {/* Fulfillment Mode */}
          <div className="bg-white border border-[#EAE5DC] rounded-xl p-6 space-y-4">
            <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
              1. Fulfillment Method
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFulfillmentType('DELIVERY')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  fulfillmentType === 'DELIVERY'
                    ? 'border-[#E05A36] bg-[#E05A36]/5'
                    : 'border-[#EAE5DC] bg-white hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-[#0F172A]">
                  <Truck className="w-4 h-4 text-[#E05A36]" />
                  <span>Courier Delivery</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  {formatCurrency(DELIVERY_FEE_KOBO)} flat fee (Free over{' '}
                  {formatCurrency(FREE_DELIVERY_THRESHOLD_KOBO)})
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentType('COLLECTION')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  fulfillmentType === 'COLLECTION'
                    ? 'border-[#E05A36] bg-[#E05A36]/5'
                    : 'border-[#EAE5DC] bg-white hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-[#0F172A]">
                  <Store className="w-4 h-4 text-[#E05A36]" />
                  <span>Host Stand Collection</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">No delivery fee · Ready in ~20m</p>
              </button>
            </div>
          </div>

          {/* Contact & Address */}
          <div className="bg-white border border-[#EAE5DC] rounded-xl p-6 space-y-4">
            <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
              2. Contact & Destination
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="checkout-name"
                  className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                >
                  Full Name *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                />
              </div>

              <div>
                <label
                  htmlFor="checkout-phone"
                  className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                >
                  Phone Number *
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 (415) 555-0148"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="checkout-email"
                className="block text-xs font-semibold text-[#1E293B] mb-1.5"
              >
                Email Address *
              </label>
              <input
                id="checkout-email"
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
              />
            </div>

            {fulfillmentType === 'DELIVERY' && (
              <div>
                <label
                  htmlFor="checkout-address"
                  className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                >
                  Delivery Street Address *
                </label>
                <input
                  id="checkout-address"
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="782 Pacific Heights Blvd, Apt 4B"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="checkout-notes"
                className="block text-xs font-semibold text-[#1E293B] mb-1.5"
              >
                Kitchen or Courier Notes (Optional)
              </label>
              <textarea
                id="checkout-notes"
                rows={2}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Allergies, gate code, or cutlery requests..."
                className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white border border-[#EAE5DC] rounded-xl p-6 space-y-4">
            <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
              3. Payment Selection
            </h2>

            {paymentMethod === 'PAYSTACK' ? (
              paymentConfig.paystackConfigured ? (
                <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#059669]" />
                  <span>
                    <strong>Live Paystack Gateway Ready ({paymentConfig.currency}):</strong> Your payment is initialized and verified server-side with a signed verification token before your order is confirmed.
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                  <span>
                    <strong>Paystack Secret Key Required:</strong> Configure{' '}
                    <code className="font-mono bg-white/70 px-1 py-0.5 rounded">PAYSTACK_SECRET_KEY</code>{' '}
                    in AI Studio Secrets / environment variables to process online Paystack transactions.
                  </span>
                </div>
              )
            ) : (
              <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#EAE5DC] text-xs text-[#475569] flex items-start gap-2.5">
                <Store className="w-4 h-4 shrink-0 mt-0.5 text-[#059669]" />
                <span>
                  <strong>Host Stand Settlement:</strong> Pay in person at 420 Mercer Street when you collect your order.
                </span>
              </div>
            )}

            <div className="space-y-3">
              <label
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  paymentMethod === 'PAYSTACK'
                    ? 'border-[#0F172A] bg-[#0F172A]/[0.03]'
                    : 'border-[#EAE5DC] bg-white hover:bg-[#FAF8F5]'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={paymentMethod === 'PAYSTACK'}
                  onChange={() => setPaymentMethod('PAYSTACK')}
                  className="mt-1 accent-[#0F172A]"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                      <span
                        aria-hidden="true"
                        className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-[#00C3F7] text-[#0F172A] font-bold text-[10px]"
                      >
                        P
                      </span>
                      <span>Pay with Paystack</span>
                    </div>
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      {paymentConfig.paystackConfigured ? 'Ready' : 'Setup required'}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Pay securely via card, bank transfer, or USSD with server-side verification.
                  </p>
                </div>
              </label>

              {fulfillmentType === 'COLLECTION' && (
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    paymentMethod === 'PAY_ON_COLLECTION'
                      ? 'border-[#E05A36] bg-[#E05A36]/5'
                      : 'border-[#EAE5DC] bg-white hover:bg-[#FAF8F5]'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'PAY_ON_COLLECTION'}
                    onChange={() => setPaymentMethod('PAY_ON_COLLECTION')}
                    className="mt-1 accent-[#E05A36]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                      <Store className="w-4 h-4 text-[#059669]" />
                      <span>Pay at Host Stand on Collection</span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Settle your bill in person when collecting your dishes.
                    </p>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Right Summary Column */}
        <aside className="lg:col-span-5 bg-white border border-[#EAE5DC] rounded-xl p-6 space-y-5 lg:sticky lg:top-24 shadow-card-rest">
          <h2 className="font-editorial text-xl font-semibold text-[#0F172A]">
            Order Summary
          </h2>

          <ul className="divide-y divide-[#EAE5DC]">
            {items.map(({ menuItem, quantity }) => (
              <li key={menuItem.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0F172A] truncate">
                    {quantity} × {menuItem.name}
                  </p>
                  <p className="text-xs text-[#64748B] tabular-nums">
                    {formatCurrency(menuItem.priceCents)} each
                  </p>
                </div>
                <span className="font-semibold text-[#0F172A] tabular-nums shrink-0">
                  {formatCurrency(menuItem.priceCents * quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="pt-4 border-t border-[#EAE5DC] space-y-2 text-sm bg-[#F5F2EB] p-4 rounded-xl">
            <div className="flex justify-between text-[#475569]">
              <span>Subtotal</span>
              <span className="font-semibold text-[#0F172A] tabular-nums">
                {formatCurrency(subtotalCents)}
              </span>
            </div>
            <div className="flex justify-between text-[#475569]">
              <span>Delivery Fee</span>
              <span className="tabular-nums">
                {deliveryFeeCents === 0 ? 'Complimentary' : formatCurrency(deliveryFeeCents)}
              </span>
            </div>
            <div className="flex justify-between text-[#475569]">
              <span>Tax (8%)</span>
              <span className="tabular-nums">{formatCurrency(taxCents)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-[#0F172A] pt-2 border-t border-[#EAE5DC]">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totalCents)}</span>
            </div>
          </div>

          {paymentMethod === 'PAYSTACK' ? (
            <PaystackButton
              totalCents={totalCents}
              loading={submitting}
              configured={paymentConfig.paystackConfigured}
              onClick={handlePaystackCheckout}
            />
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-full bg-[#E05A36] hover:bg-[#C84624] disabled:opacity-60 text-white font-semibold text-sm transition-colors tabular-nums"
            >
              {submitting
                ? 'Confirming Order...'
                : `Confirm & Place Order · ${formatCurrency(totalCents)}`}
            </button>
          )}
        </aside>
      </form>
    </div>
  );
}
