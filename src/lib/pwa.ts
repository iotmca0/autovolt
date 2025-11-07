/**
 * PWA (Progressive Web App) utilities
 * Handles service worker registration, updates, and PWA install prompts
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (import.meta.env.DEV) {
    console.info('[PWA] Development mode detected - skipping service worker registration');

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      if (registrations.length > 0) {
        console.info(`[PWA] Unregistering ${registrations.length} existing service worker(s)`);
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    }

    if ('caches' in window) {
      const cacheNames = await caches.keys();

      if (cacheNames.length > 0) {
        console.info(`[PWA] Clearing ${cacheNames.length} cache(s) for development refresh`);
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    }

    return null;
  }

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[PWA] Service worker registered:', registration.scope);

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New service worker available');
              
              // Notify user about update
              if (window.confirm('A new version is available. Reload to update?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        }
      });

      return registration;
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
      return null;
    }
  }

  console.warn('[PWA] Service workers are not supported');
  return null;
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    
    if (registration) {
      const unregistered = await registration.unregister();
      console.log('[PWA] Service worker unregistered:', unregistered);
      return unregistered;
    }
  }
  
  return false;
}

/**
 * Check if app is running as PWA
 */
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Check if PWA install is available
 */
export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}

/**
 * Setup PWA install prompt
 */
export function setupPWAInstall(
  onInstallAvailable?: () => void,
  onInstallComplete?: () => void
): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] Install prompt available');
    
    if (onInstallAvailable) {
      onInstallAvailable();
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed');
    deferredPrompt = null;
    
    if (onInstallComplete) {
      onInstallComplete();
    }
  });
}

/**
 * Show PWA install prompt
 */
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) {
    console.warn('[PWA] Install prompt not available');
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log('[PWA] Install outcome:', outcome);
    deferredPrompt = null;
    
    return outcome === 'accepted';
  } catch (error) {
    console.error('[PWA] Install prompt error:', error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    console.log('[PWA] All caches cleared');
  }
}

/**
 * Get cache size
 */
export async function getCacheSize(): Promise<number> {
  if ('caches' in window && 'storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Setup online/offline listeners
 */
export function setupOnlineListeners(
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  const handleOnline = () => {
    console.log('[PWA] Back online');
    if (onOnline) onOnline();
  };

  const handleOffline = () => {
    console.log('[PWA] Gone offline');
    if (onOffline) onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    console.log('[PWA] Notification permission:', permission);
    return permission;
  }
  return 'denied';
}

/**
 * Show notification
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if ('Notification' in window && Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.getRegistration();
    
    if (registration) {
      await registration.showNotification(title, {
        icon: '/logo.png',
        badge: '/logo.png',
        ...options,
      });
    } else {
      new Notification(title, options);
    }
  }
}

/**
 * Check if notifications are supported and enabled
 */
export function areNotificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}
