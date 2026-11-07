import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { authPersistenceReady, firebaseAuth, firebaseConfigured } from '@/api/firebase';
import { z8 } from '@/api/z8Client';

const AuthContext = createContext(null);
const PROFILE_CACHE_KEY = 'z8:session-profile';

function cachedProfileFor(email) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) || 'null');
    return cached && cached.email?.toLowerCase() === email?.toLowerCase() ? cached : null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role === 'admin' ? 'admin' : 'user',
    }));
  } catch { /* Session storage is only a UI restoration hint. */ }
}

function clearCachedProfile() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* Storage may be unavailable. */ }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    if (!firebaseAuth?.currentUser) {
      clearCachedProfile();
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      return null;
    }
    setIsLoadingAuth(true);
    try {
      const profile = await z8.auth.me();
      saveProfile(profile);
      setUser(profile);
      setIsAuthenticated(true);
      setAuthError(null);
      return profile;
    } catch (error) {
      const firebaseUser = firebaseAuth.currentUser;
      if (error.code === 'user_not_registered') {
        clearCachedProfile();
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'user_not_registered', message: error.message });
        return null;
      }
      if (error.statusCode === 401 || error.statusCode === 403) {
        clearCachedProfile();
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'session_expired', message: 'Your session needs to be renewed. Please sign in again.' });
        await signOut(firebaseAuth).catch(() => undefined);
        return null;
      }

      // Keep a valid Firebase session when the API is temporarily unavailable.
      // Backend authorization still protects every data operation.
      const cached = cachedProfileFor(firebaseUser?.email);
      let claims = {};
      try { claims = (await firebaseUser?.getIdTokenResult())?.claims || {}; } catch { /* use email fallback */ }
      const fallback = cached || (firebaseUser ? {
        email: firebaseUser.email || '',
        full_name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Z8 user',
        role: claims.admin === true || claims.role === 'admin' ? 'admin' : 'user',
      } : null);
      if (fallback) {
        setUser(fallback);
        setIsAuthenticated(true);
      }
      setAuthError({
        type: 'temporarily_unavailable',
        message: 'Your sign-in is still active. Z8 is temporarily unreachable; your data will return when the connection is restored.',
      });
      return fallback;
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
    let active = true;
    let unsubscribe;
    authPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        if (!firebaseUser) {
          clearCachedProfile();
          setUser(null);
          setIsAuthenticated(false);
          setAuthError(null);
          setIsLoadingAuth(false);
          setAuthChecked(true);
          return;
        }
        await checkUserAuth();
      });
    }).catch(() => {
      if (!active) return;
      setAuthError({ type: 'unknown', message: 'Your sign-in session could not be restored. Please sign in again.' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });
    return () => { active = false; unsubscribe?.(); };
  }, [checkUserAuth]);

  const logout = async (shouldRedirect = true) => {
    const destination = user?.role === 'admin' ? '/admin/login' : '/login';
    setUser(null);
    setIsAuthenticated(false);
    clearCachedProfile();
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
