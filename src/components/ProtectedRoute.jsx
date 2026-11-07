import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const location = useLocation();
  const adminPath = ["/admin", "/settings", "/cardholders"].some((path) => location.pathname === path || location.pathname.startsWith(path + "/"));
  const signIn = adminPath ? "/admin/login" : "/login";
  const returnTo = location.pathname + location.search;
  const signInFallback = unauthenticatedElement || <Navigate to={`${signIn}?returnTo=${encodeURIComponent(returnTo)}`} replace />;

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || (!authChecked && !authError)) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (!isAuthenticated) return signInFallback;
  }

  if (!isAuthenticated) {
    return signInFallback;
  }

  return <Outlet />;
}
