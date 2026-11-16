import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      showToast(`Welcome back, ${user.name}.`, 'success');
      if (user.role === 'ADMIN' && redirect === '/') {
        navigate('/admin');
      } else {
        navigate(redirect);
      }
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const user = await loginWithGoogle();
      showToast(`Signed in as ${user.name}.`, 'success');
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || 'Google sign-in was cancelled or unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest space-y-6">
        <div className="text-center">
          <h1 className="font-editorial text-3xl font-semibold text-[#0F172A]">Sign In</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Access your Savoria dining account or administration suite.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guest@savoria.com"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-[#1E293B] mb-1.5"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-[#E05A36] hover:bg-[#C84624] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#EAE5DC] w-full" />
          <span className="bg-white px-3 text-xs text-[#64748B]">or</span>
          <div className="border-t border-[#EAE5DC] w-full" />
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogle}
          className="w-full py-2.5 px-4 rounded-full bg-white border border-[#EAE5DC] hover:bg-[#F5F2EB] text-sm font-semibold text-[#0F172A] transition-colors"
        >
          Continue with Google
        </button>

        {/* Seeded Demo Account Helpers */}
        <div className="p-4 rounded-xl bg-[#F5F2EB] border border-[#EAE5DC] space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
            Demo Accounts (Quick Fill)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('guest@savoria.com', 'GuestSavoria2026!')}
              className="px-3 py-2 rounded-lg bg-white border border-[#EAE5DC] hover:border-[#E05A36] text-xs font-semibold text-[#0F172A] text-left"
            >
              <span className="block">Customer Demo</span>
              <span className="text-[11px] font-normal text-[#64748B]">guest@savoria.com</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('admin@savoria.com', 'AdminSavoria2026!')}
              className="px-3 py-2 rounded-lg bg-white border border-[#EAE5DC] hover:border-[#E05A36] text-xs font-semibold text-[#0F172A] text-left"
            >
              <span className="block">Admin Demo</span>
              <span className="text-[11px] font-normal text-[#64748B]">admin@savoria.com</span>
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-[#64748B]">
          New to Savoria?{' '}
          <Link to="/register" className="font-semibold text-[#E05A36] hover:underline">
            Create a guest account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await register({ name, email, password, phone, defaultAddress });
      showToast(`Welcome to Savoria, ${user.name}!`, 'success');
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest space-y-6">
        <div className="text-center">
          <h1 className="font-editorial text-3xl font-semibold text-[#0F172A]">
            Create Guest Account
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Save your delivery preferences and track your orders.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Full Name *
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clara Monet"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Email Address *
            </label>
            <input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clara@example.com"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label htmlFor="reg-phone" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Phone Number (Optional)
            </label>
            <input
              id="reg-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (415) 555-0190"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label
              htmlFor="reg-address"
              className="block text-xs font-semibold text-[#1E293B] mb-1.5"
            >
              Default Delivery Address (Optional)
            </label>
            <input
              id="reg-address"
              type="text"
              value={defaultAddress}
              onChange={(e) => setDefaultAddress(e.target.value)}
              placeholder="210 Sutter St, San Francisco"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="block text-xs font-semibold text-[#1E293B] mb-1.5"
            >
              Password * (min 8 chars, letters & numbers)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-[#E05A36] hover:bg-[#C84624] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-[#64748B]">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-[#E05A36] hover:underline">
            Sign in instead
          </Link>
        </p>
      </div>
    </div>
  );
}
