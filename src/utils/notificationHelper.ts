import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Helper to show native notifications on Android/iOS
 * Falls back to browser notifications on web
 */
export const notificationHelper = {
  /**
   * Request notification permissions (required for Android 13+)
   */
  async requestPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true; // Not needed on web
    }

    try {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        console.warn('[Notifications] LocalNotifications plugin not available on native platform');
        return false;
      }
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      return false;
    }
  },

  /**
   * Check if notifications are enabled
   */
  async checkPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    try {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        console.warn('[Notifications] LocalNotifications plugin not available on native platform');
        return false;
      }
      const result = await LocalNotifications.checkPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('[Notifications] Permission check failed:', error);
      return false;
    }
  },

  /**
   * Show a local notification for permission updates
   */
  async showPermissionUpdateNotification(data: {
    role: string;
    updatedBy: string;
    changedPermissions: string[];
  }): Promise<void> {
    // Only show native notifications on mobile platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        console.warn('[Notifications] LocalNotifications plugin not available, skipping notification');
        return;
      }
      // Check if we have permission
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.log('[Notifications] Permission not granted, skipping notification');
        return;
      }

      // Schedule the notification
      await LocalNotifications.schedule({
        notifications: [
          {
            title: '🔐 Permissions Updated',
            body: `Your ${data.role} permissions have been updated by ${data.updatedBy}`,
            id: Date.now(), // Unique ID
            schedule: { at: new Date(Date.now() + 100) }, // Show immediately (100ms delay)
            sound: undefined, // Use default sound
            attachments: undefined,
            actionTypeId: '',
            extra: {
              type: 'role_permissions_updated',
              role: data.role,
              changedPermissions: data.changedPermissions
            }
          }
        ]
      });

      console.log('[Notifications] Showed permission update notification');
    } catch (error) {
      console.error('[Notifications] Failed to show notification:', error);
    }
  },

  /**
   * Show notification for profile updates
   */
  async showProfileUpdateNotification(message: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        console.warn('[Notifications] LocalNotifications plugin not available, skipping notification');
        return;
      }
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) return;

      await LocalNotifications.schedule({
        notifications: [
          {
            title: '👤 Profile Updated',
            body: message,
            id: Date.now(),
            schedule: { at: new Date(Date.now() + 100) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: {
              type: 'profile_updated'
            }
          }
        ]
      });
    } catch (error) {
      console.error('[Notifications] Failed to show profile notification:', error);
    }
  },

  /**
   * Show notification for role changes
   */
  async showRoleChangedNotification(newRole: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        console.warn('[Notifications] LocalNotifications plugin not available, skipping notification');
        return;
      }
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) return;

      await LocalNotifications.schedule({
        notifications: [
          {
            title: '⚠️ Role Changed',
            body: `Your role has been changed to ${newRole}. Please review your new permissions.`,
            id: Date.now(),
            schedule: { at: new Date(Date.now() + 100) },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: {
              type: 'role_changed',
              newRole
            }
          }
        ]
      });
    } catch (error) {
      console.error('[Notifications] Failed to show role change notification:', error);
    }
  },

  /**
   * Handle notification tap (when user taps on notification)
   */
  setupNotificationListeners(callback: (data: any) => void): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    if (!Capacitor.isPluginAvailable('LocalNotifications')) {
      console.warn('[Notifications] LocalNotifications plugin not available, listener not attached');
      return;
    }

    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('[Notifications] User tapped notification:', notification);
      
      const extra = notification.notification.extra;
      if (extra) {
        callback(extra);
      }
    });
  },

  /**
   * Clean up listeners
   */
  async removeListeners(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    if (!Capacitor.isPluginAvailable('LocalNotifications')) return;
    await LocalNotifications.removeAllListeners();
  }
};
