import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { TabStackProvider } from '@/lib/TabStackContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import AdminRoute from '@/components/AdminRoute';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Cards = lazy(() => import('@/pages/Cards'));
const CardDetail = lazy(() => import('@/pages/CardDetail'));
const CardAssistant = lazy(() => import('@/pages/CardAssistant'));
const Cardholders = lazy(() => import('@/pages/Cardholders'));
const Activity = lazy(() => import('@/pages/Activity'));
const Settings = lazy(() => import('@/pages/Settings'));
const TechnicalSupport = lazy(() => import('@/pages/TechnicalSupport'));
const Verification = lazy(() => import('@/pages/Verification'));
const ClientFunds = lazy(() => import('@/pages/ClientFunds'));
const Account = lazy(() => import('@/pages/Account'));

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingScreen />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  // Render the main app. The shell stays mounted between screens so each tab
  // keeps its own stack and scroll position instead of being rebuilt on every tap.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<Login adminOnly />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={user?.role === "admin" ? <Navigate to="/admin" replace /> : <Dashboard />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/cards/:id" element={<CardDetail />} />
            <Route path="/assistant" element={<CardAssistant />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/account" element={user?.role === "admin" ? <Navigate to="/admin/funds" replace /> : <Account />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/connections" element={<Settings />} />
              <Route path="/admin/support" element={<TechnicalSupport />} />
              <Route path="/settings" element={<Navigate to="/admin/connections" replace />} />
              <Route path="/cardholders" element={<Cardholders />} />
              <Route path="/admin/funds" element={<ClientFunds />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <TabStackProvider>
              <AuthenticatedApp />
            </TabStackProvider>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App