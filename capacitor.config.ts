import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.autovolt.app',
  appName: 'AutoVolt',
  webDir: 'dist',
  server: {
    // Connect to your backend server
    url: 'http://172.16.3.171:5173',
    cleartext: true, // Allow HTTP in development
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true, // Allow HTTP/HTTPS mixed content
    backgroundColor: '#ffffff',
    webContentsDebuggingEnabled: true, // Enable debugging
    // Enable Chrome WebView features
    loggingBehavior: 'debug',
    // Hide status bar and use full screen
    overrideUserAgent: 'AutoVolt/1.0',
    // App will use full screen area
    appendUserAgent: 'AutoVolt'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#3b82f6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      // Fullscreen splash
      launchAutoHide: true,
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff'
    },
    SpeechRecognition: {
      // Enable speech recognition plugin
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#00000000',
      overlaysWebView: true
    }
  }
};

export default config;
