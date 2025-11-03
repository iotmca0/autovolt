import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '172.16.3.171',  // Bind to specific IP for multi-user access
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://172.16.3.171:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://172.16.3.171:3001',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    cssMinify: true,
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
        pure_funcs: mode === 'production' ? ['console.log', 'console.info'] : [],
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          
          // UI Component library (Radix UI)
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
          ],
          
          // 3D Graphics (Three.js)
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          
          // Data visualization
          'vendor-charts': ['recharts'],
          
          // Data management
          'vendor-data': ['@tanstack/react-query', '@tanstack/react-table'],
          
          // Utilities
          'vendor-utils': ['axios', 'socket.io-client', 'date-fns'],
          
          // Rich text editor
          'vendor-editor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-color',
            '@tiptap/extension-image',
            '@tiptap/extension-link',
          ],
        },
        // Generate shorter file names for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()
            : 'chunk';
          return `assets/js/[name]-[hash].js`;
        },
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.');
          const ext = info?.[info.length - 1];
          
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || '')) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/woff2?|ttf|otf|eot/i.test(ext || '')) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[ext]/[name]-[hash][extname]';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: mode === 'development',
    // Optimize CSS
    cssCodeSplit: true,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-table',
      'axios',
      'recharts',
      'three',
      '@react-three/fiber',
    ],
    exclude: ['@vite/client', '@vite/env', '@react-three/drei', 'stats.js'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  // Handle ESM compatibility issues
  ssr: {
    noExternal: ['three', '@react-three/fiber'],
  },
  // Performance optimizations
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}));
