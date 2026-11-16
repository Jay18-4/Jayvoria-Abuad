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
      if (!menuItem.isAvailable) {
        showToast(`"${menuItem.name}" is currently unavailable.`, 'error');
        return;
      }
      setItems((prev) => {
        const existing = prev.find((c) => c.menuItem.id === menuItem.id);
        if (existing) {
          const nextQty = Math.min(50, existing.quantity + quantity);
          return prev.map((c) =>
            c.menuItem.id === menuItem.id ? { menuItem, quantity: nextQty } : c
          );
        }
        return [...prev, { menuItem, quantity: Math.min(50, Math.max(1, quantity)) }];
      });
      showToast(`Added ${menuItem.name} to your bag.`, 'success');
    },
    [showToast]
  );

  const updateQuantity = useCallback((menuItemId: number, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((c) => c.menuItem.id !== menuItemId));
      return;
    }
    const clamped = Math.min(50, quantity);
    setItems((prev) =>
      prev.map((c) => (c.menuItem.id === menuItemId ? { ...c, quantity: clamped } : c))
    );
  }, []);

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
          return updated ? { ...c, menuItem: updated } : null;
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
