/**
 * Advanced Frontend Performance & UX Optimization System
 * Includes code splitting, PWA, accessibility, and performance monitoring
 */

import React, { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

// Performance monitoring
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

// PWA and offline support
import { registerSW } from 'virtual:pwa-register';

// Accessibility
import { FocusTrap, FocusScope } from 'focus-trap-react';
import { useReducedMotion } from 'framer-motion';

// Voice control integration
import { VoiceControlProvider } from './hooks/useVoiceControl';

// Lazy load components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DeviceManagement = lazy(() => import('./pages/DeviceManagement'));
const AnalyticsPage = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Lazy load components
const Header = lazy(() => import('./components/Header'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const LoadingSpinner = lazy(() => import('./components/LoadingSpinner'));
const ErrorFallback = lazy(() => import('./components/ErrorFallback'));

// Performance monitoring hook
const usePerformanceMonitoring = () => {
  useEffect(() => {
    // Web Vitals monitoring
    getCLS(console.log);
    getFID(console.log);
    getFCP(console.log);
    getLCP(console.log);
    getTTFB(console.log);

    // Custom performance observer
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Send to analytics service
        if (entry.entryType === 'largest-contentful-paint') {
          console.log('LCP:', entry.startTime);
        }
        if (entry.entryType === 'first-input') {
          console.log('FID:', entry.processingStart - entry.startTime);
        }
        if (entry.entryType === 'layout-shift') {
          console.log('CLS:', entry.value);
        }
      }
    });

    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });

    return () => observer.disconnect();
  }, []);
};

// PWA update handler
const usePWAUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState(null);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdateAvailable(true);
      },
      onOfflineReady() {
        console.log('App ready to work offline');
      },
      onRegistered(registration) {
        setRegistration(registration);
        console.log('SW registered:', registration);
      },
      onRegisterError(error) {
        console.error('SW registration error:', error);
      }
    });

    return () => {
      if (registration) {
        registration.unregister();
      }
    };
  }, []);

  const updateApp = useCallback(() => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
      window.location.reload();
    }
  }, [registration]);

  return { updateAvailable, updateApp };
};

// Accessibility hook
const useAccessibility = () => {
  const [announcements, setAnnouncements] = useState([]);
  const prefersReducedMotion = useReducedMotion();

  const announce = useCallback((message, priority = 'polite') => {
    const announcement = {
      id: Date.now(),
      message,
      priority,
      timestamp: new Date()
    };

    setAnnouncements(prev => [...prev, announcement]);

    // Remove announcement after screen reader has time to read it
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== announcement.id));
    }, 1000);
  }, []);

  return { announce, announcements, prefersReducedMotion };
};

// Loading component with skeleton
const PageSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
    <div className="h-32 bg-gray-200 rounded mb-4"></div>
    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
  </div>
);

// Error boundary component
const AppErrorBoundary = ({ children }) => (
  <ErrorBoundary
    FallbackComponent={({ error, resetErrorBoundary }) => (
      <Suspense fallback={<PageSkeleton />}>
        <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
      </Suspense>
    )}
  >
    {children}
  </ErrorBoundary>
);

// Route change handler for analytics
const RouteTracker = () => {
  const location = useLocation();

  useEffect(() => {
    // Track page views
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', process.env.REACT_APP_GA_TRACKING_ID, {
        page_path: location.pathname,
      });
    }

    // Track route changes for performance
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = window.performance.getEntriesByType('navigation')[0];
      if (navigation) {
        console.log('Navigation timing:', {
          type: navigation.type,
          duration: navigation.loadEventEnd - navigation.fetchStart,
          path: location.pathname
        });
      }
    }
  }, [location]);

  return null;
};

// Main app component
const App = () => {
  const { updateAvailable, updateApp } = usePWAUpdate();
  const { announce, announcements, prefersReducedMotion } = useAccessibility();

  usePerformanceMonitoring();

  // Query client with optimized settings
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          return failureCount < 3;
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
      },
    },
  });

  return (
    <AppErrorBoundary>
      <HelmetProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider client={queryClient}>
            <VoiceControlProvider>
              <BrowserRouter>
                <RouteTracker />

                {/* Accessibility announcements */}
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  {announcements.map(announcement => (
                    <div key={announcement.id}>{announcement.message}</div>
                  ))}
                </div>

                {/* PWA update notification */}
                {updateAvailable && (
                  <div
                    role="alert"
                    className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg"
                    aria-live="assertive"
                  >
                    <p className="mb-2">A new version is available!</p>
                    <button
                      onClick={updateApp}
                      className="bg-white text-blue-500 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      Update Now
                    </button>
                  </div>
                )}

                <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                  <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route
                        path="/*"
                        element={
                          <FocusTrap>
                            <div className="flex">
                              <Sidebar />
                              <div className="flex-1 flex flex-col overflow-hidden">
                                <Header />
                                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900">
                                  <div className="container mx-auto px-6 py-8">
                                    <Routes>
                                      <Route path="/" element={<Dashboard />} />
                                      <Route path="/devices" element={<DeviceManagement />} />
                                      <Route path="/analytics" element={<AnalyticsPage />} />
                                      <Route path="/settings" element={<Settings />} />
                                      <Route path="*" element={<NotFound />} />
                                    </Routes>
                                  </div>
                                </main>
                              </div>
                            </div>
                          </FocusTrap>
                        }
                      />
                    </Routes>
                  </Suspense>
                </div>

                {/* Global components */}
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                    },
                  }}
                />

                {/* Analytics */}
                {process.env.NODE_ENV === 'production' && (
                  <>
                    <Analytics />
                    <SpeedInsights />
                  </>
                )}

                {/* Development tools */}
                {process.env.NODE_ENV === 'development' && (
                  <ReactQueryDevtools initialIsOpen={false} />
                )}
              </BrowserRouter>
            </VoiceControlProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </HelmetProvider>
    </AppErrorBoundary>
  );
};

// Performance optimization: Preload critical routes
const preloadRoutes = () => {
  // Preload dashboard on app start
  import('./pages/Dashboard');
  import('./components/Header');
  import('./components/Sidebar');
};

// Initialize preloading
if (typeof window !== 'undefined') {
  // Preload after initial render
  setTimeout(preloadRoutes, 100);
}

export default App;