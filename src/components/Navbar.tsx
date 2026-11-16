import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount, setDrawerOpen } = useCart();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const handleLogout = async () => {
    await logout();
    showToast('Signed out cleanly.', 'info');
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#EAE5DC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <Link
          to="/"
          className="font-editorial text-2xl font-semibold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
        >
          Savoria
        </Link>

        {/* Zone 2: Clean single-line navigation */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#1E293B]"
        >
          <Link
            to="/"
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              isActive('/')
                ? 'border-[#E05A36] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#E05A36]'
            }`}
          >
            Menu
          </Link>
          <Link
            to="/orders"
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              isActive('/orders')
                ? 'border-[#E05A36] text-[#0F172A] font-semibold'
                : 'border-transparent hover:text-[#E05A36]'
            }`}
          >
            My Orders
          </Link>
          {user && (
            <Link
              to="/profile"
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                isActive('/profile')
                  ? 'border-[#E05A36] text-[#0F172A] font-semibold'
                  : 'border-transparent hover:text-[#E05A36]'
              }`}
            >
              Profile
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                isActive('/admin')
                  ? 'border-[#E05A36] text-[#0F172A] font-semibold'
                  : 'border-transparent hover:text-[#E05A36]'
              }`}
            >
              Admin Suite
            </Link>
          )}
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Open shopping bag with ${itemCount} items`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFFFFF] border border-[#EAE5DC] text-sm font-semibold text-[#0F172A] hover:bg-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4 text-[#E05A36]" />
            <span>Bag</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#0F172A] text-white text-xs tabular-nums">
              {itemCount}
            </span>
          </button>

          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-[#1E293B] hover:bg-[#F5F2EB] transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden md:inline-flex items-center justify-center px-5 py-2 rounded-full bg-[#E05A36] hover:bg-[#C84624] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="md:hidden p-2 rounded-lg border border-[#EAE5DC] bg-white text-[#0F172A]"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#EAE5DC] bg-[#FAF8F5] px-4 py-4 space-y-2">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0F172A] hover:bg-[#F5F2EB]"
          >
            Menu
          </Link>
          <Link
            to="/orders"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0F172A] hover:bg-[#F5F2EB]"
          >
            My Orders
          </Link>
          {user && (
            <Link
              to="/profile"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0F172A] hover:bg-[#F5F2EB]"
            >
              Profile
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-[#E05A36] hover:bg-[#F5F2EB]"
            >
              Admin Suite
            </Link>
          )}
          <div className="pt-2 border-t border-[#EAE5DC]">
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
              >
                Sign Out ({user.name})
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center px-4 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
              >
                Sign In / Register
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
