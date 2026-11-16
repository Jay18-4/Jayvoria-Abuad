import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatCurrency } from '../services/api';

export function CartDrawer() {
  const {
    items,
    isDrawerOpen,
    setDrawerOpen,
    updateQuantity,
    removeItem,
    subtotalCents,
    itemCount,
  } = useCart();
  const navigate = useNavigate();

  if (!isDrawerOpen) return null;

  const estimatedTax = Math.round(subtotalCents * 0.08);
  const estimatedTotal = subtotalCents + estimatedTax;
  const hasUnavailable = items.some((i) => !i.menuItem.isAvailable);

  const handleCheckout = () => {
    setDrawerOpen(false);
    navigate('/checkout');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0F172A]/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Bag"
      onClick={() => setDrawerOpen(false)}
    >
      <aside
        className="w-full max-w-md bg-[#FAF8F5] h-full flex flex-col border-l border-[#EAE5DC] shadow-floating-pill"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-white border-b border-[#EAE5DC] flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-2xl font-semibold text-[#0F172A]">Your Bag</h2>
            <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} selected
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close shopping bag"
            className="w-10 h-10 rounded-full border border-[#EAE5DC] bg-white hover:bg-[#F5F2EB] flex items-center justify-center text-[#0F172A]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <div className="w-16 h-16 rounded-full bg-[#F5F2EB] flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7 text-[#8C716A]" />
              </div>
              <h3 className="font-editorial text-xl font-semibold text-[#0F172A]">
                Your bag is empty
              </h3>
              <p className="mt-2 text-sm text-[#64748B] max-w-xs">
                Explore Savoria’s seasonal plates, wood-fired mains, and artisan pastas to begin your order.
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="mt-6 px-6 py-2.5 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            items.map(({ menuItem, quantity }) => (
              <div
                key={menuItem.id}
                className="bg-white border border-[#EAE5DC] rounded-xl p-4 flex gap-4 items-start"
              >
                <img
                  src={menuItem.imageUrl}
                  alt={menuItem.name}
                  referrerPolicy="no-referrer"
                  className="w-20 h-20 rounded-lg object-cover bg-[#F5F2EB] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-[#0F172A] leading-snug">
                      {menuItem.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => removeItem(menuItem.id)}
                      aria-label={`Remove ${menuItem.name} from bag`}
                      className="text-[#94A3B8] hover:text-[#DC2626] transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[#64748B] mt-0.5 tabular-nums">
                    {formatCurrency(menuItem.priceCents)} each
                  </p>

                  {!menuItem.isAvailable && (
                    <p className="mt-1 text-xs font-semibold text-[#DC2626]">
                      Unavailable — please remove before checkout
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F5F2EB]">
                      <button
                        type="button"
                        onClick={() => updateQuantity(menuItem.id, quantity - 1)}
                        aria-label={`Decrease ${menuItem.name} quantity`}
                        className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#0F172A]"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[24px] text-center text-xs font-bold tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(menuItem.id, quantity + 1)}
                        aria-label={`Increase ${menuItem.name} quantity`}
                        className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[#0F172A]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="font-bold text-sm text-[#0F172A] tabular-nums">
                      {formatCurrency(menuItem.priceCents * quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 bg-white border-t border-[#EAE5DC] space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[#475569]">
                <span>Subtotal</span>
                <span className="font-semibold text-[#0F172A] tabular-nums">
                  {formatCurrency(subtotalCents)}
                </span>
              </div>
              <div className="flex justify-between text-[#475569]">
                <span>Estimated Tax (8%)</span>
                <span className="tabular-nums">{formatCurrency(estimatedTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#0F172A] pt-2 border-t border-[#EAE5DC]">
                <span>Estimated Total</span>
                <span className="tabular-nums">{formatCurrency(estimatedTotal)}</span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Final delivery fee and totals are verified on the server at checkout. Complimentary delivery on orders over $85.00.
              </p>
            </div>

            <button
              type="button"
              disabled={hasUnavailable}
              onClick={handleCheckout}
              className="w-full py-3.5 px-6 rounded-full bg-[#E05A36] hover:bg-[#C84624] disabled:bg-[#CBD5E1] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
