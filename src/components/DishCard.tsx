import React from 'react';
import { Minus, Plus, Clock, UtensilsCrossed } from 'lucide-react';
import type { MenuItem } from '../types';
import { formatCurrency } from '../services/api';
import { useCart } from '../context/CartContext';

interface DishCardProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
}

function getBadgeStyle(tag: string) {
  const lower = tag.toLowerCase();
  if (lower.includes('chef') || lower.includes('popular')) {
    return 'bg-[#FFFBEB]/95 text-[#92400E] border-[#FDE68A] shadow-sm';
  }
  if (lower.includes('spicy') || lower.includes('hot')) {
    return 'bg-[#FFF5F2]/95 text-[#9A3412] border-[#FECACA] shadow-sm';
  }
  return 'bg-[#ECFDF5]/95 text-[#065F46] border-[#A7F3D0] shadow-sm';
}

export function DishCard({ item, onSelect }: DishCardProps) {
  const { getQuantity, addItem, updateQuantity } = useCart();
  const qty = getQuantity(item.id);
  const primaryTag = item.dietaryTags[0];
  const isSoldOut = !item.isAvailable || item.stockQuantity <= 0;
  const isLowStock = !isSoldOut && item.stockQuantity <= 5;
  const maxOrderable = Math.min(50, item.stockQuantity);

  return (
    <article
      className={`group flex flex-col bg-[#FFFFFF] border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest transition-all duration-200 ${
        !isSoldOut ? 'hover:shadow-card-hover hover:-translate-y-0.5' : 'opacity-85'
      }`}
    >
      {/* Image top half */}
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-label={`View details for ${item.name}`}
        className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F2EB] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05A36]"
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover transition-transform duration-300 ${
              !isSoldOut ? 'group-hover:scale-105' : 'grayscale-[45%]'
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#F5F2EB] text-[#8C716A]">
            <UtensilsCrossed className="w-8 h-8 mb-1 opacity-50" />
            <span className="text-xs font-medium">{item.name}</span>
          </div>
        )}

        {primaryTag && (
          <span
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border backdrop-blur-sm ${getBadgeStyle(
              primaryTag
            )}`}
          >
            {primaryTag}
          </span>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 bg-[#0F172A]/45 flex items-center justify-center">
            <span className="px-3.5 py-1.5 rounded-full bg-[#FFFFFF]/95 text-[#0F172A] text-xs font-bold uppercase tracking-wider">
              Sold Out
            </span>
          </div>
        )}
      </button>

      {/* Body */}
      <div className="flex-1 p-5 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#64748B] mb-1.5">
            <span className="font-semibold uppercase tracking-wider">{item.categoryName}</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              {item.prepTimeMins} min
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSelect(item)}
            className="text-left focus-visible:outline-none focus-visible:underline"
          >
            <h3 className="font-editorial text-xl font-semibold text-[#0F172A] leading-snug group-hover:text-[#E05A36] transition-colors">
              {item.name}
            </h3>
          </button>

          <p className="mt-2 text-sm text-[#475569] line-clamp-2 leading-relaxed">
            {item.description}
          </p>

          {isLowStock && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-0.5 rounded-md tabular-nums">
              Only {item.stockQuantity} left
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-[#EAE5DC] flex items-center justify-between gap-3">
          <span className="text-lg font-bold text-[#0F172A] tabular-nums">
            {formatCurrency(item.priceCents)}
          </span>

          {isSoldOut ? (
            <span className="text-xs font-semibold text-[#64748B] px-3 py-1.5 rounded-full bg-[#F5F2EB]">
              Sold Out
            </span>
          ) : qty > 0 ? (
            <div
              className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F5F2EB]"
              role="group"
              aria-label={`Quantity for ${item.name}`}
            >
              <button
                type="button"
                onClick={() => updateQuantity(item.id, qty - 1)}
                aria-label={`Decrease quantity of ${item.name}`}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[#0F172A] hover:bg-[#FAF8F5] shadow-sm transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[26px] text-center text-sm font-bold text-[#0F172A] tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                disabled={qty >= maxOrderable}
                onClick={() => updateQuantity(item.id, qty + 1)}
                aria-label={`Increase quantity of ${item.name}`}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[#0F172A] hover:bg-[#FAF8F5] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => addItem(item, 1)}
              aria-label={`Add ${item.name} to bag`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
