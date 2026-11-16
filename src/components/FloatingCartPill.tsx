import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatCurrency } from '../services/api';

export function FloatingCartPill() {
  const { itemCount, subtotalCents, setDrawerOpen, isDrawerOpen } = useCart();

  if (itemCount === 0 || isDrawerOpen) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`View bag: ${itemCount} items, subtotal ${formatCurrency(subtotalCents)}`}
        className="pointer-events-auto inline-flex items-center gap-3 px-5 py-3 rounded-full bg-[#0F172A] hover:bg-[#1E293B] text-white shadow-floating-pill transition-transform duration-200 hover:-translate-y-0.5"
      >
        <ShoppingBag className="w-4 h-4 text-[#F59E0B]" />
        <span className="text-sm font-semibold whitespace-nowrap">View Bag</span>
        <span className="px-2 py-0.5 rounded-full bg-[#F59E0B] text-[#0F172A] text-xs font-bold tabular-nums">
          {itemCount}
        </span>
        <span className="text-sm font-bold tabular-nums border-l border-white/20 pl-3">
          {formatCurrency(subtotalCents)}
        </span>
      </button>
    </div>
  );
}
