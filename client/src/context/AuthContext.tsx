import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { setAccessToken } from '../services/api';
import pushNotificationService from '../services/pushNotificationService';

interface UserType {
  id: string;
  fullName: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  course: string;
  branch: string;
  year: number;
  collegeName: string;
  avatar: string;
  bio?: string;
  ratingAverage: number;
  completedRentals: number;
  isBlocked?: boolean;
}

interface AuthContextType {
  user: UserType | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  registerUser: (data: any) => Promise<any>;
  logout: () => Promise<void>;
  updateUser: (data: any) => Promise<void>;
  verifyOTP: (email: string, otp: string) => Promise<any>;
  loginSendOTP: (email: string) => Promise<any>;
  loginVerifyOTP: (email: string, otp: string) => Promise<any>;
  refreshUser: () => Promise<void>;
  deleteUserAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize and verify session on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('accessToken');
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/profile');
        if (response.data?.success) {
          setUser(response.data.user);
        }
      } catch (error) {
        console.log('[Auth Context] No active session found.');
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for logout event triggered by Axios interceptor on 401 refresh failure
    const handleLogoutEvent = () => {
      setUser(null);
    };

    window.addEventListener('auth_logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth_logout', handleLogoutEvent);
    };
  }, []);

  // Whenever user is authenticated, ensure push subscription is registered for current domain (rentora.org.in)
  useEffect(() => {
    if (user?.id) {
      pushNotificationService.syncSubscription().catch(() => {});
    }
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data?.success) {
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        if (response.data.user?.collegeName) {
          localStorage.setItem('rentora_location', response.data.user.collegeName);
          window.dispatchEvent(new Event('rentora_location_changed'));
        }
        return response.data;
      }
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (data: any) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/register', data);
      if (response.data?.success && !response.data.requiresVerification) {
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        if (response.data.user?.collegeName) {
          localStorage.setItem('rentora_location', response.data.user.collegeName);
          window.dispatchEvent(new Event('rentora_location_changed'));
        }
      }
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (email: string, otp: string) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/verify-otp', { email, otp });
      if (response.data?.success) {
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        if (response.data.user?.collegeName) {
          localStorage.setItem('rentora_location', response.data.user.collegeName);
          window.dispatchEvent(new Event('rentora_location_changed'));
        }
      }
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const loginSendOTP = async (email: string) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login-send-otp', { email });
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const loginVerifyOTP = async (email: string, otp: string) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login-verify-otp', { email, otp });
      if (response.data?.success) {
        setAccessToken(response.data.accessToken);
        setUser(response.data.user);
        if (response.data.user?.collegeName) {
          localStorage.setItem('rentora_location', response.data.user.collegeName);
          window.dispatchEvent(new Event('rentora_location_changed'));
        }
      }
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.warn('[Auth Context] Logout endpoint failed:', e);
    } finally {
      setAccessToken('');
      setUser(null);
      setLoading(false);
    }
  };

  const updateUser = async (data: any) => {
    const config = data instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined;
    const response = await api.patch('/auth/profile', data, config);
    if (response.data?.success) {
      setUser(response.data.user);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/profile');
      if (response.data?.success) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.warn('[Auth Context] Failed to refresh user profile:', error);
    }
  };

  const deleteUserAccount = async () => {
    setLoading(true);
    try {
      await api.delete('/auth/profile');
    } finally {
      setAccessToken('');
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        registerUser,
        logout,
        updateUser,
        verifyOTP,
        loginSendOTP,
        loginVerifyOTP,
        refreshUser,
        deleteUserAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
export default AuthContext;
