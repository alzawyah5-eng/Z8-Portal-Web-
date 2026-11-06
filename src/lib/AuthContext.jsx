import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth, firebaseConfigured } from '@/api/firebase';
import { z8 } from '@/api/z8Client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    if (!firebaseAuth?.currentUser) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      return null;
    }
    setIsLoadingAuth(true);
    try {
      const profile = await z8.auth.me();
      setUser(profile);
      setIsAuthenticated(true);
      setAuthError(null);
      return profile;
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(error.code === 'user_not_registered' ? null : {
        type: 'unknown',
        message: error.message || 'Could not load your account.',
      });
      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigured || !firebaseAuth) {
      setAuthError({ type: 'unknown', message: 'Firebase is not configured for this web app.' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return undefined;
    }
    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError(null);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }
      await checkUserAuth();
    });
  }, [checkUserAuth]);

  const logout = async (shouldRedirect = true) => {
    const destination = user?.role === 'admin' ? '/admin/login' : '/login';
    setUser(null);
    setIsAuthenticated(false);
    await z8.auth.logout(shouldRedirect ? new URL(destination, window.location.origin).href : undefined);
  };

  const navigateToLogin = () => z8.auth.redirectToLogin();
  const checkAppState = () => checkUserAuth();

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
