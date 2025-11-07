import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';

export const RootRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Check if running on mobile (Capacitor)
  const isMobile = Capacitor.isNativePlatform();

  // If authenticated, go to dashboard
  // If not authenticated:
  //   - On mobile: go directly to login
  //   - On web: go to landing page
  return <Navigate to={isAuthenticated ? "/dashboard" : (isMobile ? "/login" : "/landing")} replace />;
};
