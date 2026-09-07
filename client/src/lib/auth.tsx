/**
 * Auth context.
 *
 * Manages JWT access token in memory (not localStorage for the refresh token),
 * with httpOnly cookie for the refresh token. Auto-refreshes before expiry.
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, setAccessToken, getAccessToken } from './api';
import { updateSocketAuth } from './socket';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session on mount
  useEffect(() => {
    async function restore() {
      try {
        const data = await api.post<{ data: { accessToken: string } }>('/api/v1/auth/refresh', {});
        if (data?.data?.accessToken) {
          setAccessToken(data.data.accessToken);
          updateSocketAuth(data.data.accessToken);
          // Fetch user profile
          const profile = await api.get<{ data: User }>('/api/v1/users/me');
          setUser(profile.data);
        }
      } catch {
        // Not logged in — that's fine
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  // Auto-refresh every 14 minutes (access token expires at 15m)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!getAccessToken()) return;
      try {
        const data = await api.post<{ data: { accessToken: string } }>('/api/v1/auth/refresh', {});
        if (data?.data?.accessToken) {
          setAccessToken(data.data.accessToken);
          updateSocketAuth(data.data.accessToken);
        }
      } catch {
        setAccessToken(null);
        setUser(null);
      }
    }, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ data: { user: User; accessToken: string } }>(
      '/api/v1/auth/login',
      { email, password },
    );
    setAccessToken(res.data.accessToken);
    updateSocketAuth(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const res = await api.post<{ data: { user: User; accessToken: string } }>(
      '/api/v1/auth/register',
      { email, password, firstName, lastName },
    );
    setAccessToken(res.data.accessToken);
    updateSocketAuth(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout', {});
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null);
    updateSocketAuth(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
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
