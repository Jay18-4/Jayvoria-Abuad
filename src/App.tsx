import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/Navbar';
import { CartDrawer } from './components/CartDrawer';
import { FloatingCartPill } from './components/FloatingCartPill';
import { MenuPage } from './pages/MenuPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#0F172A]">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<MenuPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/order-confirmation/:reference" element={<OrderConfirmationPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/admin" element={<AdminDashboardPage />} />
                  <Route path="/admin/*" element={<AdminDashboardPage />} />
                </Routes>
              </main>
              <footer className="border-t border-[#EAE5DC] bg-white py-8 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
                  <p>
                    <strong className="font-editorial text-sm text-[#0F172A]">Savoria</strong> · Haute Hospitality & Culinary Suite
                  </p>
                  <p>420 Mercer Street · Open Daily 11:30 – 23:00</p>
                </div>
              </footer>
              <CartDrawer />
              <FloatingCartPill />
            </div>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
