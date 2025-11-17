import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Layout } from "@/components/Layout";
import { PrivateRoute } from "./components/PrivateRoute";
import { RootRedirect } from "./components/RootRedirect";
import { AuthProvider } from '@/context/AuthContext';
import { GlobalLoadingProvider } from '@/hooks/useGlobalLoading';
import { GlobalLoadingOverlay } from '@/components/GlobalLoadingOverlay';
import { DevicesProvider } from '@/hooks/useDevices';
import { SocketProvider } from '@/context/SocketContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LogoLoader } from '@/components/Logo';
import { SkipToContent } from '@/components/SkipToContent';
import ErrorBoundary from '@/components/ErrorBoundary';
import FloatingVoiceMic from '@/components/FloatingVoiceMic';

// Lazy load components for better performance
const Index = lazy(() => import("./pages/Index"));
// const Landing = lazy(() => import("./pages/Landing"));
const Devices = lazy(() => import("./pages/Devices"));
const Switches = lazy(() => import("./pages/Switches"));
const Master = lazy(() => import("./pages/Master"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Users = lazy(() => import("./pages/Users"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Register = lazy(() => import("./pages/Register"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile").then(module => ({ default: module.Profile })));
const PermissionManagement = lazy(() => import("./pages/PermissionManagement"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const ActiveLogs = lazy(() => import("./pages/ActiveLogs"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const Tickets = lazy(() => import("./pages/Tickets"));
// New feature pages
const SystemHealthPage = lazy(() => import("./pages/SystemHealthPage"));
const AIMLPage = lazy(() => import("./pages/AIMLPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const GrafanaPage = lazy(() => import("./pages/GrafanaPage"));
const GrafanaPublic = lazy(() => import("./pages/GrafanaPublic"));
const ESP32GrafanaPage = lazy(() => import("./pages/ESP32GrafanaPage"));
const PrometheusPage = lazy(() => import("./pages/PrometheusPage"));
const SocketTest = lazy(() => import("./components/SocketTest"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const VoiceSettingsPage = lazy(() => import("./pages/VoiceSettingsPage").then(module => ({ default: module.VoiceSettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as any).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        console.error('Mutation error:', error);
      },
    },
  },
});

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <LogoLoader size="lg" />
  </div>
);
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="autovolt-ui-theme">
        <AuthProvider>
          <NotificationProvider>
            <SocketProvider>
              <GlobalLoadingProvider>
              <TooltipProvider>
                <SkipToContent />
                <Toaster />
                <Sonner />
                <BrowserRouter future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true
                }}>
                  <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                      {/* Root redirect - smart routing based on auth */}
                      <Route index element={<RootRedirect />} />
                    
                    {/* Public Landing Page - REMOVED */}
                    {/* <Route path="/landing" element={<Landing />} /> */}
                    
                    {/* Auth Routes */}
                    <Route path="/register" element={<Register />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password/:resetToken" element={<ResetPassword />} />

                    {/* Protected Routes */}
                    <Route
                      path="/dashboard"
                      element={
                        <PrivateRoute>
                          <DevicesProvider>
                            <Layout />
                          </DevicesProvider>
                        </PrivateRoute>
                      }
                    >
                      <Route index element={<Index />} />
                      <Route path="devices" element={<Devices />} />
                      <Route path="switches" element={<Switches />} />
                      <Route path="master" element={<Master />} />
                      <Route path="schedule" element={<Schedule />} />
                      <Route path="users" element={<Users />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="profile" element={<UserProfile />} />
                      <Route path="permissions" element={<PermissionManagement />} />
                      <Route path="roles" element={<RoleManagement />} />
                      <Route path="logs" element={<PrivateRoute><ActiveLogs /></PrivateRoute>} />
                      <Route path="system-health" element={<SystemHealthPage />} />
                      <Route path="tickets" element={<Tickets />} />
                      <Route path="aiml" element={<AIMLPage />} />
                      <Route path="voice-settings" element={<VoiceSettingsPage />} />
                      <Route path="analytics" element={<AnalyticsPage />} />
                      <Route path="grafana" element={<GrafanaPage />} />
                      <Route path="grafana-public" element={<GrafanaPublic />} />
                      <Route path="esp32-grafana" element={<ESP32GrafanaPage />} />
                      <Route path="prometheus" element={<PrometheusPage />} />
                      <Route path="socket-test" element={<SocketTest />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
                  </ErrorBoundary>
                  {/* Global Floating Voice Button - Available on all pages */}
                  <FloatingVoiceMic />
              </BrowserRouter>
              <GlobalLoadingOverlay />
            </TooltipProvider>
          </GlobalLoadingProvider>
        </SocketProvider>
      </NotificationProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};export default App;
