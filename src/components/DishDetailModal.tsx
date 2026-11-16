import React, { useState } from 'react';
import { X, Minus, Plus, Clock } from 'lucide-react';
import type { MenuItem } from '../types';
import { formatCurrency } from '../services/api';
import { useCart } from '../context/CartContext';

interface DishDetailModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

export function DishDetailModal({ item, onClose }: DishDetailModalProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const handleAdd = () => {
    addItem(item, quantity);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dish-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#FFFFFF] border border-[#EAE5DC] rounded-xl overflow-hidden shadow-floating-pill"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dish details"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 hover:bg-white border border-[#EAE5DC] flex items-center justify-center text-[#0F172A] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="aspect-[4/3] md:aspect-auto md:h-full bg-[#F5F2EB]">
            <img
              src={item.imageUrl}
              alt={item.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#64748B] uppercase tracking-wider">
                <span>{item.categoryName}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  {item.prepTimeMins} mins
                </span>
              </div>

              <h2
                id="dish-modal-title"
                className="mt-2 font-editorial text-2xl font-semibold text-[#0F172A]"
              >
                {item.name}
              </h2>

              <p className="mt-3 text-sm text-[#475569] leading-relaxed">{item.description}</p>

              {item.dietaryTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.dietaryTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-[#F5F2EB] text-[#1E293B] text-[11px] font-semibold uppercase tracking-wide"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#EAE5DC] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#64748B]">Price</span>
                <span className="text-2xl font-bold text-[#0F172A] tabular-nums">
                  {formatCurrency(item.priceCents)}
                </span>
              </div>

              {item.isAvailable ? (
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F5F2EB]">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#0F172A]"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[30px] text-center font-bold text-sm tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                      aria-label="Increase quantity"
                      className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#0F172A]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAdd}
                    className="flex-1 py-3 px-5 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors tabular-nums"
                  >
                    Add to Bag · {formatCurrency(item.priceCents * quantity)}
                  </button>
                </div>
              ) : (
                <div className="py-3 px-4 rounded-lg bg-[#F5F2EB] text-center text-sm font-semibold text-[#64748B]">
                  This seasonal dish is currently unavailable.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
