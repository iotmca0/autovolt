import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface VoicePermissions {
  canControlDevices: boolean;
  canViewDeviceStatus: boolean;
  canCreateSchedules: boolean;
  canQueryAnalytics: boolean;
  canAccessAllDevices: boolean;
  restrictToAssignedDevices: boolean;
}

interface VoiceSession {
  voiceToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    role: string;
  };
  permissions?: VoicePermissions;
}

interface VoiceSessionHook {
  voiceToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  permissions: VoicePermissions | null;
  createVoiceSession: () => Promise<VoiceSession | null>;
  refreshVoiceSession: () => void;
  clearVoiceSession: () => void;
  revokeVoiceSession: () => Promise<boolean>;
}

export const useVoiceSession = (): VoiceSessionHook => {
  const [voiceToken, setVoiceToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<VoicePermissions | null>(null);

  const createVoiceSession = useCallback(async (): Promise<VoiceSession | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await api.post<{ 
        success: boolean; 
        data: VoiceSession;
        permissions?: VoicePermissions;
      }>('/voice-assistant/session/create');
      
      if (response.data.success) {
        const sessionData = response.data.data;
        const voicePermissions = response.data.permissions || sessionData.permissions;
        
        setVoiceToken(sessionData.voiceToken);
        setIsAuthenticated(true);
        setPermissions(voicePermissions || null);
        
        // Store in sessionStorage for persistence
        sessionStorage.setItem('voiceToken', sessionData.voiceToken);
        sessionStorage.setItem('voiceTokenExpiry', 
          String(Date.now() + (sessionData.expiresIn * 1000))
        );
        if (voicePermissions) {
          sessionStorage.setItem('voicePermissions', JSON.stringify(voicePermissions));
        }
        
        return sessionData;
      }
      
      throw new Error('Failed to create voice session');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to create voice session';
      const errorCode = err.response?.data?.code;
      setError(errorMessage);
      setIsAuthenticated(false);
      setPermissions(null);
      
      // Log specific permission errors
      if (errorCode === 'VOICE_CONTROL_DISABLED') {
        console.warn(`⚠️ Voice control disabled for role: ${err.response?.data?.role}`);
      }
      
      console.error('Voice session creation error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshVoiceSession = useCallback(() => {
    const stored = sessionStorage.getItem('voiceToken');
    const expiry = sessionStorage.getItem('voiceTokenExpiry');
    const storedPermissions = sessionStorage.getItem('voicePermissions');
    
    if (stored && expiry) {
      const expiryTime = parseInt(expiry, 10);
      
      // Check if token is expired
      if (Date.now() < expiryTime) {
        setVoiceToken(stored);
        setIsAuthenticated(true);
        
        if (storedPermissions) {
          try {
            setPermissions(JSON.parse(storedPermissions));
          } catch (e) {
            console.error('Failed to parse voice permissions:', e);
          }
        }
      } else {
        // Token expired, clear it
        clearVoiceSession();
        setError('Voice session expired');
      }
    }
  }, []);

  const clearVoiceSession = useCallback(() => {
    setVoiceToken(null);
    setIsAuthenticated(false);
    setError(null);
    setPermissions(null);
    sessionStorage.removeItem('voiceToken');
    sessionStorage.removeItem('voiceTokenExpiry');
    sessionStorage.removeItem('voicePermissions');
  }, []);

  const revokeVoiceSession = useCallback(async (): Promise<boolean> => {
    if (!voiceToken) return false;
    
    try {
      const response = await api.delete<{ success: boolean }>(
        '/voice-assistant/session/revoke',
        { data: { voiceToken } }
      );
      
      if (response.data.success) {
        clearVoiceSession();
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Failed to revoke voice session:', err);
      return false;
    }
  }, [voiceToken, clearVoiceSession]);

  // Auto-refresh on mount
  useEffect(() => {
    refreshVoiceSession();
  }, [refreshVoiceSession]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    const expiryStr = sessionStorage.getItem('voiceTokenExpiry');
    if (!expiryStr) return;

    const expiryTime = parseInt(expiryStr, 10);
    const timeUntilExpiry = expiryTime - Date.now();
    
    // Refresh 5 minutes before expiry
    const refreshTime = timeUntilExpiry - (5 * 60 * 1000);

    if (refreshTime > 0) {
      const timer = setTimeout(() => {
        createVoiceSession();
      }, refreshTime);

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, createVoiceSession]);

  return {
    voiceToken,
    isLoading,
    isAuthenticated,
    error,
    permissions,
    createVoiceSession,
    refreshVoiceSession,
    clearVoiceSession,
    revokeVoiceSession
  };
};
