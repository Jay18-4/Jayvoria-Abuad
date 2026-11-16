import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, MenuItem } from '../types';
import { useToast } from './ToastContext';

const STORAGE_KEY = 'savoria_cart_v1';

interface CartContextValue {
  items: CartItem[];
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addItem: (menuItem: MenuItem, quantity?: number) => void;
  updateQuantity: (menuItemId: number, quantity: number) => void;
  removeItem: (menuItemId: number) => void;
  clearCart: () => void;
  syncMenuItems: (latestMenu: MenuItem[]) => void;
  getQuantity: (menuItemId: number) => number;
  itemCount: number;
  subtotalCents: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore invalid localStorage
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota errors
    }
  }, [items]);

  const addItem = useCallback(
    (menuItem: MenuItem, quantity = 1) => {
      if (!menuItem.isAvailable || menuItem.stockQuantity <= 0) {
        showToast(`"${menuItem.name}" is currently sold out.`, 'error');
        return;
      }
      const maxAllowed = Math.min(50, menuItem.stockQuantity);
      let limitHit = false;
      let addedSuccessfully = false;

      setItems((prev) => {
        const existing = prev.find((c) => c.menuItem.id === menuItem.id);
        if (existing) {
          if (existing.quantity >= maxAllowed) {
            limitHit = true;
            return prev;
          }
          const nextQty = Math.min(maxAllowed, existing.quantity + quantity);
          addedSuccessfully = true;
          return prev.map((c) =>
            c.menuItem.id === menuItem.id ? { menuItem, quantity: nextQty } : c
          );
        }
        addedSuccessfully = true;
        return [...prev, { menuItem, quantity: Math.min(maxAllowed, Math.max(1, quantity)) }];
      });

      if (limitHit) {
        showToast(
          `Only ${menuItem.stockQuantity} portion${menuItem.stockQuantity === 1 ? '' : 's'} of "${menuItem.name}" available.`,
          'info'
        );
      } else if (addedSuccessfully) {
        showToast(`Added ${menuItem.name} to your bag.`, 'success');
      }
    },
    [showToast]
  );

  const updateQuantity = useCallback(
    (menuItemId: number, quantity: number) => {
      if (quantity <= 0) {
        setItems((prev) => prev.filter((c) => c.menuItem.id !== menuItemId));
        return;
      }
      let cappedMessage: string | null = null;
      setItems((prev) =>
        prev.map((c) => {
          if (c.menuItem.id !== menuItemId) return c;
          const stockLimit = c.menuItem.stockQuantity > 0 ? c.menuItem.stockQuantity : 50;
          const maxAllowed = Math.min(50, stockLimit);
          if (quantity > maxAllowed) {
            cappedMessage = `Only ${maxAllowed} portion${maxAllowed === 1 ? '' : 's'} of "${c.menuItem.name}" left in stock.`;
          }
          return { ...c, quantity: Math.min(maxAllowed, quantity) };
        })
      );
      if (cappedMessage) {
        showToast(cappedMessage, 'info');
      }
    },
    [showToast]
  );

  const removeItem = useCallback(
    (menuItemId: number) => {
      setItems((prev) => {
        const target = prev.find((c) => c.menuItem.id === menuItemId);
        if (target) {
          showToast(`Removed ${target.menuItem.name} from bag.`, 'info');
        }
        return prev.filter((c) => c.menuItem.id !== menuItemId);
      });
    },
    [showToast]
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const syncMenuItems = useCallback((latestMenu: MenuItem[]) => {
    const byId = new Map(latestMenu.map((m) => [m.id, m]));
    setItems((prev) =>
      prev
        .map((c) => {
          const updated = byId.get(c.menuItem.id);
          if (!updated) return null;
          const clampedQty =
            updated.stockQuantity > 0 ? Math.min(c.quantity, updated.stockQuantity) : c.quantity;
          return { ...c, menuItem: updated, quantity: clampedQty };
        })
        .filter((x): x is CartItem => x !== null)
    );
  }, []);

  const getQuantity = useCallback(
    (menuItemId: number) => {
      return items.find((c) => c.menuItem.id === menuItemId)?.quantity || 0;
    },
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const subtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.menuItem.priceCents * item.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        isDrawerOpen,
        setDrawerOpen,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        syncMenuItems,
        getQuantity,
        itemCount,
        subtotalCents,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
