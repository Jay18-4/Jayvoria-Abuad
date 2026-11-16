import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function ProfilePage() {
  const { user, loading, updateProfile } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || '');
      setDefaultAddress(user.defaultAddress || '');
    }
  }, [user]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-sm text-[#64748B]">
        Loading profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#EAE5DC] rounded-xl p-8">
          <h1 className="font-editorial text-2xl font-semibold text-[#0F172A]">
            Sign in required
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">
            Please sign in to manage your personal profile and delivery preferences.
          </p>
          <Link
            to="/login?redirect=/profile"
            className="mt-6 inline-block px-6 py-2.5 rounded-full bg-[#E05A36] text-white text-sm font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ name, phone, defaultAddress });
      showToast('Profile preferences saved.', 'success');
    } catch (err: any) {
      setError(err.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-white border border-[#EAE5DC] rounded-xl p-8 shadow-card-rest space-y-6">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-[#EAE5DC]">
          <div>
            <h1 className="font-editorial text-3xl font-semibold text-[#0F172A]">
              Guest Profile
            </h1>
            <p className="text-sm text-[#64748B] mt-1">{user.email}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F2EB] text-[#0F172A] text-xs font-bold uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-[#E05A36]" />
            {user.role}
          </span>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Full Name
            </label>
            <input
              id="profile-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label htmlFor="profile-phone" className="block text-xs font-semibold text-[#1E293B] mb-1.5">
              Phone Number
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (415) 555-0148"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div>
            <label
              htmlFor="profile-address"
              className="block text-xs font-semibold text-[#1E293B] mb-1.5"
            >
              Default Delivery Address
            </label>
            <input
              id="profile-address"
              type="text"
              value={defaultAddress}
              onChange={(e) => setDefaultAddress(e.target.value)}
              placeholder="782 Pacific Heights Blvd, Apt 4B"
              className="w-full px-3.5 py-2.5 bg-white border border-[#EAE5DC] rounded-lg text-sm input-focus-glow"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-[#64748B] inline-flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#059669]" />
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-full bg-[#E05A36] hover:bg-[#C84624] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
