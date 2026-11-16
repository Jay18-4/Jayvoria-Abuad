import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, clearSessionAuth, setCsrfToken, setSessionAuth } from '../services/api';
import { signInWithGooglePopup, testFirestoreConnection } from '../lib/firebase';
import type { User } from '../types';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  defaultAddress?: string;
}

interface ProfilePayload {
  name: string;
  phone: string;
  defaultAddress: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (payload: ProfilePayload) => Promise<User>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiRequest<{ user: User | null; csrfToken: string | null }>('/api/auth/me');
      setUser(res.user);
      if (res.user) {
        setCsrfToken(res.csrfToken);
      } else {
        clearSessionAuth();
      }
    } catch {
      setUser(null);
      clearSessionAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    testFirestoreConnection();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ user: User; csrfToken: string; sessionToken?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    setSessionAuth({ csrfToken: res.csrfToken, sessionToken: res.sessionToken ?? null });
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await apiRequest<{ user: User; csrfToken: string; sessionToken?: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setSessionAuth({ csrfToken: res.csrfToken, sessionToken: res.sessionToken ?? null });
    setUser(res.user);
    return res.user;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const { idToken } = await signInWithGooglePopup();
    const res = await apiRequest<{ user: User; csrfToken: string; sessionToken?: string }>(
      '/api/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      }
    );
    setSessionAuth({ csrfToken: res.csrfToken, sessionToken: res.sessionToken ?? null });
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      clearSessionAuth();
    }
  }, []);

  const updateProfile = useCallback(async (payload: ProfilePayload) => {
    const res = await apiRequest<{ user: User }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setUser(res.user);
    return res.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        updateProfile,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
