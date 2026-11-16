import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Users,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Search,
  Eye,
  X,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, apiRequest, formatCurrency } from '../services/api';
import type {
  AdminStats,
  Category,
  CustomerSummary,
  MenuItem,
  Order,
  OrderStatus,
} from '../types';
import { getStatusBadgeClasses } from './OrdersPage';

type AdminTab = 'overview' | 'orders' | 'menu' | 'customers';

const NEXT_STATUS_OPTIONS: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

const CULINARY_IMAGE_PRESETS = [
  { label: 'Truffle Burrata', url: '/src/assets/images/dish_truffle_burrata_1794832267229.jpg' },
  { label: 'Saffron Scallop Risotto', url: '/src/assets/images/dish_saffron_risotto_1794832268605.jpg' },
  { label: 'Chanterelle Tagliatelle', url: '/src/assets/images/dish_mushroom_tagliatelle_1794832269761.jpg' },
  { label: 'Wagyu Ribeye', url: '/src/assets/images/dish_wagyu_ribeye_1794832267847.jpg' },
  { label: 'Mediterranean Branzino', url: '/src/assets/images/dish_branzino_crudo_1794832268780.jpg' },
  { label: 'Espresso Chocolate Torte', url: '/src/assets/images/dish_chocolate_torte_1794832269166.jpg' },
  { label: 'Blood Orange Spritz', url: '/src/assets/images/dish_citrus_aperitif_1794832268754.jpg' },
];

export function AdminDashboardPage() {
  const { user, loading: authLoading, refreshSession } = useAuth();
  const { showToast } = useToast();
  const hasMountedOrderFilters = useRef(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Orders filters
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Menu filters & modals
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({});
  const [updatingStockId, setUpdatingStockId] = useState<number | null>(null);
  const [dishForm, setDishForm] = useState({
    categoryId: 0,
    name: '',
    description: '',
    priceDollars: '24000.00',
    imageUrl: CULINARY_IMAGE_PRESETS[0].url,
    dietaryTagsText: '',
    prepTimeMins: '18',
    stockQuantity: '25',
    isAvailable: true,
    isFeatured: false,
  });

  // Category modal/form
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  // Customers filter
  const [customerSearch, setCustomerSearch] = useState('');

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes, menuRes, catRes, custRes] = await Promise.all([
        apiRequest<{ stats: AdminStats; recentOrders: Order[] }>('/api/admin/stats'),
        apiRequest<{ orders: Order[] }>('/api/admin/orders'),
        apiRequest<{ items: MenuItem[] }>('/api/menu'),
        apiRequest<{ categories: Category[] }>('/api/categories'),
        apiRequest<{ customers: CustomerSummary[] }>('/api/admin/customers'),
      ]);
      setStats(statsRes.stats);
      setRecentOrders(statsRes.recentOrders);
      setOrders(ordersRes.orders);
      setMenuItems(menuRes.items);
      setStockDrafts(
        Object.fromEntries(menuRes.items.map((item) => [item.id, String(item.stockQuantity ?? 0)]))
      );
      setCategories(catRes.categories);
      setCustomers(custRes.customers);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        await refreshSession();
        return;
      }
      showToast(err.message || 'Failed to load admin data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [refreshSession, showToast]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  const fetchFilteredOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (orderSearch.trim()) params.set('search', orderSearch.trim());
    if (orderStatusFilter !== 'All') params.set('status', orderStatusFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);

    try {
      const res = await apiRequest<{ orders: Order[] }>(`/api/admin/orders?${params.toString()}`);
      setOrders(res.orders);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        await refreshSession();
        return;
      }
      showToast(err.message || 'Failed to filter orders.', 'error');
    }
  }, [orderSearch, orderStatusFilter, dateFrom, dateTo, refreshSession, showToast]);

  useEffect(() => {
    if (!hasMountedOrderFilters.current) {
      hasMountedOrderFilters.current = true;
      return;
    }
    if (user?.role === 'ADMIN') {
      fetchFilteredOrders();
    }
  }, [user, orderStatusFilter, dateFrom, dateTo, fetchFilteredOrders]);

  const handleStatusUpdate = async (orderId: number, nextStatus: OrderStatus) => {
    try {
      const res = await apiRequest<{ order: Order }>(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(`Order ${res.order.orderReference} updated to ${nextStatus}.`, 'success');
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(res.order);
      }
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Unable to update order status.', 'error');
    }
  };

  const openAddDishModal = () => {
    setEditingDish(null);
    setDishForm({
      categoryId: categories[0]?.id || 1,
      name: '',
      description: '',
      priceDollars: '28000.00',
      imageUrl: CULINARY_IMAGE_PRESETS[0].url,
      dietaryTagsText: "Chef's Selection",
      prepTimeMins: '18',
      stockQuantity: '25',
      isAvailable: true,
      isFeatured: false,
    });
    setDishModalOpen(true);
  };

  const openEditDishModal = (item: MenuItem) => {
    setEditingDish(item);
    setDishForm({
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceDollars: (item.priceCents / 100).toFixed(2),
      imageUrl: item.imageUrl,
      dietaryTagsText: item.dietaryTags.join(', '),
      prepTimeMins: String(item.prepTimeMins),
      stockQuantity: String(item.stockQuantity ?? 0),
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured,
    });
    setDishModalOpen(true);
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceCents = Math.round(Number(dishForm.priceDollars) * 100);
    const parsedStock = Number(dishForm.stockQuantity);
    if (!Number.isInteger(parsedStock) || parsedStock < 0 || parsedStock > 9999) {
      showToast('Stock quantity must be a whole number between 0 and 9,999.', 'error');
      return;
    }
    const dietaryTags = dishForm.dietaryTagsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      categoryId: Number(dishForm.categoryId),
      name: dishForm.name,
      description: dishForm.description,
      priceCents,
      imageUrl: dishForm.imageUrl,
      dietaryTags,
      prepTimeMins: Number(dishForm.prepTimeMins) || 15,
      stockQuantity: parsedStock,
      isAvailable: parsedStock === 0 ? false : dishForm.isAvailable,
      isFeatured: dishForm.isFeatured,
    };

    try {
      if (editingDish) {
        await apiRequest(`/api/admin/menu/${editingDish.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast(`Updated "${dishForm.name}".`, 'success');
      } else {
        await apiRequest('/api/admin/menu', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(`Added "${dishForm.name}" to the menu.`, 'success');
      }
      setDishModalOpen(false);
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Unable to save dish.', 'error');
    }
  };

  const handleAdjustStock = async (item: MenuItem, rawNextQty: number) => {
    const nextQty = Math.max(0, Math.min(9999, Math.trunc(rawNextQty)));
    if (Number.isNaN(nextQty) || nextQty === item.stockQuantity) {
      setStockDrafts((prev) => ({ ...prev, [item.id]: String(item.stockQuantity) }));
      return;
    }

    setUpdatingStockId(item.id);
    setStockDrafts((prev) => ({ ...prev, [item.id]: String(nextQty) }));
    try {
      const res = await apiRequest<{ item: MenuItem }>(`/api/admin/menu/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stockQuantity: nextQty }),
      });
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? res.item : m)));
      setStockDrafts((prev) => ({ ...prev, [item.id]: String(res.item.stockQuantity) }));
      showToast(
        res.item.stockQuantity === 0
          ? `"${res.item.name}" is at 0 stock and marked Sold Out.`
          : `"${res.item.name}" stock updated to ${res.item.stockQuantity}.`,
        res.item.stockQuantity === 0 ? 'info' : 'success'
      );
    } catch (err: any) {
      setStockDrafts((prev) => ({ ...prev, [item.id]: String(item.stockQuantity) }));
      showToast(err.message || 'Failed to update stock quantity.', 'error');
    } finally {
      setUpdatingStockId(null);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      await apiRequest(`/api/admin/menu/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      showToast(
        `${item.name} marked ${!item.isAvailable ? 'available' : 'unavailable'}.`,
        'info'
      );
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update availability.', 'error');
    }
  };

  const handleDeleteDish = async (item: MenuItem) => {
    try {
      await apiRequest(`/api/admin/menu/${item.id}`, { method: 'DELETE' });
      showToast(`Removed "${item.name}" from active menu.`, 'info');
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete dish.', 'error');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await apiRequest('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          description: newCategoryDesc.trim(),
          sortOrder: categories.length + 1,
        }),
      });
      showToast(`Category "${newCategoryName.trim()}" created.`, 'success');
      setNewCategoryName('');
      setNewCategoryDesc('');
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Unable to create category.', 'error');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    try {
      await apiRequest(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
      showToast(`Deleted category "${cat.name}".`, 'info');
      await loadDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Cannot delete category.', 'error');
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm text-[#64748B]">
        Verifying administrator privileges...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest">
          <ShieldAlert className="w-10 h-10 text-[#E05A36] mx-auto mb-3" />
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Administrator Sign In Required
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Please sign in with an authorized administrator account to access Savoria’s operations suite.
          </p>
          <Link
            to="/login?redirect=/admin"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#0F172A] text-white text-sm font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#FECACA] rounded-xl p-8 shadow-card-rest">
          <ShieldAlert className="w-10 h-10 text-[#DC2626] mx-auto mb-3" />
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            403 · Access Restricted
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Your account ({user.email}) has guest privileges and cannot access the administrator dashboard.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
          >
            Return to Customer Menu
          </Link>
        </div>
      </div>
    );
  }

  const filteredMenu = menuItems.filter((m) => {
    if (menuCatFilter !== 'all' && String(m.categoryId) !== menuCatFilter) return false;
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  });

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'menu', label: 'Menu & Categories', icon: <UtensilsCrossed className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 bg-white border border-[#EAE5DC] rounded-xl p-4 shrink-0 shadow-card-rest">
          <div className="px-3 pb-4 mb-3 border-b border-[#EAE5DC]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#E05A36]">
              Operations Suite
            </p>
            <h1 className="font-editorial text-xl font-semibold text-[#0F172A] mt-0.5">
              Savoria Admin
            </h1>
            <p className="text-xs text-[#64748B] truncate mt-0.5">{user.name}</p>
          </div>

          <nav aria-label="Administrator Sections" className="flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#1E293B] hover:bg-[#F5F2EB]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Live restaurant figures synced from Savoria database.
              </p>
            </div>
            <button
              type="button"
              onClick={loadDashboardData}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#EAE5DC] hover:bg-[#F5F2EB] text-xs font-semibold text-[#0F172A]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && !stats && loading && (
            <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 text-center text-sm text-[#64748B] shadow-card-rest">
              Loading restaurant telemetry...
            </div>
          )}

          {activeTab === 'overview' && stats && (
            <div className="space-y-6">
              {/* Dedicated Wide Revenue KPI Card */}
              <div className="bg-white border border-[#EAE5DC] rounded-xl p-5 sm:p-6 shadow-card-rest flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Total Revenue
                  </p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Cumulative gross sales excluding cancelled orders
                  </p>
                </div>
                <p
                  data-testid="admin-overview-revenue"
                  className="text-3xl sm:text-4xl font-bold text-[#0F172A] tabular-nums tracking-tight whitespace-nowrap"
                >
                  {formatCurrency(stats.totalRevenueCents)}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Orders', value: String(stats.totalOrders) },
                  { label: 'Pending', value: String(stats.pendingOrders) },
                  { label: 'Completed', value: String(stats.completedOrders) },
                  { label: 'Customers', value: String(stats.totalCustomers) },
                  { label: 'Menu Items', value: String(stats.totalMenuItems) },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="bg-white border border-[#EAE5DC] rounded-xl p-4 shadow-card-rest flex flex-col justify-between"
                  >
                    <p className="text-xs font-semibold text-[#64748B] whitespace-nowrap">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F172A] tabular-nums">
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest">
                <div className="px-6 py-4 border-b border-[#EAE5DC] flex items-center justify-between">
                  <h3 className="font-editorial text-lg font-semibold text-[#0F172A]">
                    Recent Orders
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs font-semibold text-[#E05A36] hover:underline"
                  >
                    View all orders
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE5DC] text-xs font-semibold text-[#64748B]">
                        <th className="py-3 px-6">Reference</th>
                        <th className="py-3 px-4">Guest</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-6 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DC] text-sm">
                      {recentOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                          onClick={() => setSelectedOrder(o)}
                        >
                          <td className="py-3 px-6 font-bold text-[#0F172A] tabular-nums">
                            {o.orderReference}
                          </td>
                          <td className="py-3 px-4">{o.customerName}</td>
                          <td className="py-3 px-4 text-xs text-[#64748B] tabular-nums">
                            {new Date(o.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusBadgeClasses(
                                o.status
                              )}`}
                            >
                              {o.status}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right font-semibold tabular-nums">
                            {formatCurrency(o.totalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ORDERS MANAGEMENT TAB */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#EAE5DC] rounded-xl p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="admin-order-search" className="block text-xs font-semibold text-[#64748B] mb-1">
                    Search Ref / Customer
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="admin-order-search"
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchFilteredOrders()}
                      placeholder="SAV-... or guest name"
                      className="flex-1 px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                    />
                    <button
                      type="button"
                      onClick={fetchFilteredOrders}
                      className="px-4 py-2 rounded-lg bg-[#0F172A] text-white text-xs font-semibold"
                    >
                      Search
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="admin-status-filter" className="block text-xs font-semibold text-[#64748B] mb-1">
                    Status
                  </label>
                  <select
                    id="admin-status-filter"
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                  >
                    {['All', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'].map(
                      (s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="admin-date-from" className="block text-xs font-semibold text-[#64748B] mb-1">
                    From Date
                  </label>
                  <input
                    id="admin-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="admin-date-to" className="block text-xs font-semibold text-[#64748B] mb-1">
                    To Date
                  </label>
                  <input
                    id="admin-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE5DC] text-xs font-semibold text-[#64748B]">
                        <th className="py-3 px-5">Reference</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DC] text-sm">
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#64748B]">
                            No orders match your current filters.
                          </td>
                        </tr>
                      ) : (
                        orders.map((order) => {
                          const nextOptions = NEXT_STATUS_OPTIONS[order.status];
                          return (
                            <tr key={order.id} className="hover:bg-[#FAF8F5]">
                              <td className="py-3.5 px-5 font-bold text-[#0F172A] tabular-nums">
                                {order.orderReference}
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-[#0F172A]">{order.customerName}</p>
                                <p className="text-xs text-[#64748B]">{order.customerEmail}</p>
                              </td>
                              <td className="py-3.5 px-4 text-xs text-[#64748B] tabular-nums">
                                {new Date(order.createdAt).toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-right font-semibold tabular-nums">
                                {formatCurrency(order.totalCents)}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadgeClasses(
                                    order.status
                                  )}`}
                                >
                                  {order.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="inline-flex items-center gap-2">
                                  {nextOptions.length > 0 && (
                                    <select
                                      aria-label={`Update status for ${order.orderReference}`}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          handleStatusUpdate(
                                            order.id,
                                            e.target.value as OrderStatus
                                          );
                                        }
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-[#EAE5DC] bg-white text-xs font-semibold text-[#0F172A]"
                                    >
                                      <option value="">Advance status...</option>
                                      {nextOptions.map((st) => (
                                        <option key={st} value={st}>
                                          Mark {st}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrder(order)}
                                    aria-label={`Inspect order ${order.orderReference}`}
                                    className="p-2 rounded-lg border border-[#EAE5DC] hover:bg-[#F5F2EB] text-[#0F172A]"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MENU & CATEGORIES TAB */}
          {activeTab === 'menu' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#EAE5DC] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      aria-label="Filter menu items"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Filter dishes..."
                      className="w-full pl-9 pr-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                    />
                  </div>
                  <select
                    aria-label="Filter by category"
                    value={menuCatFilter}
                    onChange={(e) => setMenuCatFilter(e.target.value)}
                    className="px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={openAddDishModal}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Menu Item</span>
                </button>
              </div>

              <div className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE5DC] text-xs font-semibold text-[#64748B]">
                        <th className="py-3 px-5">Dish</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-right">Price</th>
                        <th className="py-3 px-4">Stock Qty</th>
                        <th className="py-3 px-4">Availability</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DC] text-sm">
                      {filteredMenu.map((item) => {
                        const draftVal = stockDrafts[item.id] ?? String(item.stockQuantity ?? 0);
                        const isBusy = updatingStockId === item.id;
                        const isLow = item.stockQuantity > 0 && item.stockQuantity <= 5;
                        const isZero = item.stockQuantity <= 0;

                        return (
                          <tr key={item.id} className="hover:bg-[#FAF8F5]">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-3">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-11 h-11 rounded-lg object-cover bg-[#F5F2EB] shrink-0"
                                />
                                <div>
                                  <p className="font-semibold text-[#0F172A]">{item.name}</p>
                                  <p className="text-xs text-[#64748B] line-clamp-1 max-w-xs">
                                    {item.description}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-[#475569]">
                              {item.categoryName}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold tabular-nums whitespace-nowrap">
                              {formatCurrency(item.priceCents)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                <div className="inline-flex items-center border border-[#EAE5DC] rounded-lg bg-white overflow-hidden w-fit">
                                  <button
                                    type="button"
                                    disabled={isBusy || item.stockQuantity <= 0}
                                    onClick={() => handleAdjustStock(item, item.stockQuantity - 1)}
                                    aria-label={`Decrease stock for ${item.name}`}
                                    className="w-7 h-7 flex items-center justify-center text-[#0F172A] hover:bg-[#F5F2EB] disabled:opacity-40"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="9999"
                                    disabled={isBusy}
                                    aria-label={`Stock quantity for ${item.name}`}
                                    value={draftVal}
                                    onChange={(e) =>
                                      setStockDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    onBlur={() => {
                                      const parsed = Number(draftVal);
                                      if (Number.isInteger(parsed) && parsed >= 0) {
                                        handleAdjustStock(item, parsed);
                                      } else {
                                        setStockDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: String(item.stockQuantity),
                                        }));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    className="w-12 text-center text-xs font-bold text-[#0F172A] tabular-nums py-1 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleAdjustStock(item, item.stockQuantity + 1)}
                                    aria-label={`Increase stock for ${item.name}`}
                                    className="w-7 h-7 flex items-center justify-center text-[#0F172A] hover:bg-[#F5F2EB] disabled:opacity-40"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {isZero ? (
                                  <span className="text-[11px] font-semibold text-[#DC2626]">
                                    Sold out
                                  </span>
                                ) : isLow ? (
                                  <span className="text-[11px] font-semibold text-[#D97706]">
                                    Low stock
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => handleToggleAvailability(item)}
                                aria-label={`Toggle availability for ${item.name}`}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                                  item.isAvailable
                                    ? 'bg-[#D1FAE5] text-[#065F46]'
                                    : 'bg-[#FEE2E2] text-[#991B1B]'
                                }`}
                              >
                                {item.isAvailable ? 'Available' : 'Sold Out'}
                              </button>
                            </td>
                            <td className="py-3 px-5 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditDishModal(item)}
                                  aria-label={`Edit ${item.name}`}
                                  className="p-2 rounded-lg border border-[#EAE5DC] hover:bg-[#F5F2EB] text-[#0F172A]"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDish(item)}
                                  aria-label={`Delete ${item.name}`}
                                  className="p-2 rounded-lg border border-[#EAE5DC] hover:bg-[#FEF2F2] text-[#DC2626]"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category Management */}
              <div className="bg-white border border-[#EAE5DC] rounded-xl p-6 space-y-4 shadow-card-rest">
                <h3 className="font-editorial text-xl font-semibold text-[#0F172A]">
                  Category Management
                </h3>
                <form onSubmit={handleCreateCategory} className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category name (e.g. Tasting Sides)"
                    className="flex-1 min-w-[200px] px-3.5 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                  />
                  <input
                    type="text"
                    value={newCategoryDesc}
                    onChange={(e) => setNewCategoryDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    className="flex-1 min-w-[200px] px-3.5 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-full bg-[#0F172A] text-white text-sm font-semibold"
                  >
                    Add Category
                  </button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#EAE5DC] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#0F172A] truncate">{c.name}</p>
                        <p className="text-xs text-[#64748B] tabular-nums">
                          {c.itemCount || 0} dishes
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c)}
                        aria-label={`Delete category ${c.name}`}
                        className="p-1.5 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-white"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMERS TAB */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#EAE5DC] rounded-xl p-4">
                <div className="relative max-w-sm">
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    aria-label="Search customers"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers by name, email, phone..."
                    className="w-full pl-9 pr-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#EAE5DC] rounded-xl overflow-hidden shadow-card-rest">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE5DC] text-xs font-semibold text-[#64748B]">
                        <th className="py-3 px-5">Guest</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4 text-right">Orders</th>
                        <th className="py-3 px-4 text-right">Total Spend</th>
                        <th className="py-3 px-5 text-right">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5DC] text-sm">
                      {filteredCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-[#FAF8F5]">
                          <td className="py-3.5 px-5">
                            <p className="font-semibold text-[#0F172A]">{c.name}</p>
                            <p className="text-xs text-[#64748B]">{c.email}</p>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[#475569]">
                            <p>{c.phone || 'No phone'}</p>
                            <p className="truncate max-w-xs text-[#64748B]">
                              {c.defaultAddress || 'No saved address'}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold tabular-nums">
                            {c.orderCount}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold tabular-nums">
                            {formatCurrency(c.totalSpentCents)}
                          </td>
                          <td className="py-3.5 px-5 text-right text-xs text-[#64748B] tabular-nums">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={`Order ${selectedOrder.orderReference} details`}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="w-full max-w-lg bg-white border border-[#EAE5DC] rounded-xl p-6 shadow-floating-pill space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-editorial text-2xl font-semibold text-[#0F172A]">
                  {selectedOrder.orderReference}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {selectedOrder.customerName} · {selectedOrder.customerPhone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="p-1.5 rounded-full hover:bg-[#F5F2EB]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAF8F5] border border-[#EAE5DC] text-xs space-y-1">
              <p>
                <strong>Fulfillment:</strong> {selectedOrder.fulfillmentType}{' '}
                {selectedOrder.deliveryAddress ? `— ${selectedOrder.deliveryAddress}` : ''}
              </p>
              <p>
                <strong>Payment:</strong> {selectedOrder.paymentMethod} ({selectedOrder.paymentStatus})
              </p>
              {selectedOrder.orderNotes && (
                <p>
                  <strong>Notes:</strong> {selectedOrder.orderNotes}
                </p>
              )}
            </div>

            <ul className="divide-y divide-[#EAE5DC] text-sm">
              {selectedOrder.items.map((it) => (
                <li key={it.id} className="py-2 flex justify-between">
                  <span>
                    {it.quantity}× {it.itemName}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(it.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="pt-2 border-t border-[#EAE5DC] flex justify-between font-bold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(selectedOrder.totalCents)}</span>
            </div>

            {NEXT_STATUS_OPTIONS[selectedOrder.status].length > 0 && (
              <div className="pt-3 flex flex-wrap gap-2">
                {NEXT_STATUS_OPTIONS[selectedOrder.status].map((nextSt) => (
                  <button
                    key={nextSt}
                    type="button"
                    onClick={() => handleStatusUpdate(selectedOrder.id, nextSt)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold ${
                      nextSt === 'Cancelled'
                        ? 'bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]'
                        : 'bg-[#E05A36] text-white hover:bg-[#C84624]'
                    }`}
                  >
                    Mark {nextSt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Dish Modal */}
      {dishModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={editingDish ? 'Edit menu item' : 'Add menu item'}
          onClick={() => setDishModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white border border-[#EAE5DC] rounded-xl p-6 shadow-floating-pill max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#EAE5DC]">
              <h3 className="font-editorial text-2xl font-semibold text-[#0F172A]">
                {editingDish ? 'Edit Menu Item' : 'Add Menu Item'}
              </h3>
              <button
                type="button"
                onClick={() => setDishModalOpen(false)}
                aria-label="Close dish form"
                className="p-1.5 rounded-full hover:bg-[#F5F2EB]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDish} className="mt-4 space-y-4">
              <div>
                <label htmlFor="dish-name" className="block text-xs font-semibold text-[#1E293B] mb-1">
                  Dish Name *
                </label>
                <input
                  id="dish-name"
                  type="text"
                  required
                  value={dishForm.name}
                  onChange={(e) => setDishForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="dish-category"
                    className="block text-xs font-semibold text-[#1E293B] mb-1"
                  >
                    Category *
                  </label>
                  <select
                    id="dish-category"
                    value={dishForm.categoryId}
                    onChange={(e) =>
                      setDishForm((f) => ({ ...f, categoryId: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="dish-price" className="block text-xs font-semibold text-[#1E293B] mb-1">
                    Price (NGN) *
                  </label>
                  <input
                    id="dish-price"
                    type="number"
                    step="0.01"
                    min="0.50"
                    required
                    value={dishForm.priceDollars}
                    onChange={(e) => setDishForm((f) => ({ ...f, priceDollars: e.target.value }))}
                    className="w-full px-3.5 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="dish-desc"
                  className="block text-xs font-semibold text-[#1E293B] mb-1"
                >
                  Description * (min 10 chars)
                </label>
                <textarea
                  id="dish-desc"
                  rows={3}
                  required
                  minLength={10}
                  value={dishForm.description}
                  onChange={(e) => setDishForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                />
              </div>

              <div>
                <label htmlFor="dish-img" className="block text-xs font-semibold text-[#1E293B] mb-1">
                  Culinary Photograph
                </label>
                <select
                  id="dish-img"
                  value={dishForm.imageUrl}
                  onChange={(e) => setDishForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm bg-white"
                >
                  {CULINARY_IMAGE_PRESETS.map((preset) => (
                    <option key={preset.url} value={preset.url}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label htmlFor="dish-stock" className="block text-xs font-semibold text-[#1E293B] mb-1">
                    Stock Qty *
                  </label>
                  <input
                    id="dish-stock"
                    type="number"
                    min="0"
                    max="9999"
                    required
                    value={dishForm.stockQuantity}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      const numeric = Number(nextVal);
                      setDishForm((f) => ({
                        ...f,
                        stockQuantity: nextVal,
                        isAvailable:
                          nextVal !== '' && Number.isFinite(numeric) && numeric === 0
                            ? false
                            : Number(f.stockQuantity) === 0 && numeric > 0
                            ? true
                            : f.isAvailable,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow tabular-nums"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="dish-prep" className="block text-xs font-semibold text-[#1E293B] mb-1">
                    Prep Time (mins)
                  </label>
                  <input
                    id="dish-prep"
                    type="number"
                    min="1"
                    max="180"
                    value={dishForm.prepTimeMins}
                    onChange={(e) => setDishForm((f) => ({ ...f, prepTimeMins: e.target.value }))}
                    className="w-full px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow tabular-nums"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="dish-tags" className="block text-xs font-semibold text-[#1E293B] mb-1">
                    Dietary Tags
                  </label>
                  <input
                    id="dish-tags"
                    type="text"
                    value={dishForm.dietaryTagsText}
                    onChange={(e) =>
                      setDishForm((f) => ({ ...f, dietaryTagsText: e.target.value }))
                    }
                    placeholder="Vegetarian, GF"
                    className="w-full px-3 py-2 border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                  <input
                    type="checkbox"
                    disabled={Number(dishForm.stockQuantity) === 0}
                    checked={Number(dishForm.stockQuantity) === 0 ? false : dishForm.isAvailable}
                    onChange={(e) => setDishForm((f) => ({ ...f, isAvailable: e.target.checked }))}
                    className="accent-[#E05A36]"
                  />
                  <span>
                    Available for ordering
                    {Number(dishForm.stockQuantity) === 0 ? ' (set stock > 0)' : ''}
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                  <input
                    type="checkbox"
                    checked={dishForm.isFeatured}
                    onChange={(e) => setDishForm((f) => ({ ...f, isFeatured: e.target.checked }))}
                    className="accent-[#E05A36]"
                  />
                  <span>Featured dish</span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDishModalOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-[#EAE5DC] text-sm font-semibold text-[#0F172A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold"
                >
                  {editingDish ? 'Save Changes' : 'Create Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
