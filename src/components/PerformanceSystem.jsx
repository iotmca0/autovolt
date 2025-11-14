/**
 * Advanced Performance Optimization System for AutoVolt
 * Includes code splitting, lazy loading, caching, and performance monitoring
 */

import React, { Suspense, lazy, useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Performance monitoring utilities
export const PerformanceMonitor = {
  // Web Vitals tracking
  webVitals: {
    cls: null,
    fid: null,
    fcp: null,
    lcp: null,
    ttfb: null
  },

  // Custom metrics
  customMetrics: new Map(),

  // Initialize performance monitoring
  init() {
    // Web Vitals
    this.trackWebVitals();

    // Resource timing
    this.trackResourceTiming();

    // Navigation timing
    this.trackNavigationTiming();

    // Memory usage
    this.trackMemoryUsage();

    // Long tasks
    this.trackLongTasks();
  },

  trackWebVitals() {
    // CLS - Cumulative Layout Shift
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.cls = entry.value;
        this.reportMetric('CLS', entry.value);
      }
    }).observe({ entryTypes: ['layout-shift'] });

    // FID - First Input Delay
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.fid = entry.processingStart - entry.startTime;
        this.reportMetric('FID', this.webVitals.fid);
      }
    }).observe({ entryTypes: ['first-input'] });

    // FCP - First Contentful Paint
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.fcp = entry.startTime;
        this.reportMetric('FCP', entry.startTime);
      }
    }).observe({ entryTypes: ['paint'] });

    // LCP - Largest Contentful Paint
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.lcp = entry.startTime;
        this.reportMetric('LCP', entry.startTime);
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // TTFB - Time to First Byte
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.webVitals.ttfb = entry.responseStart - entry.requestStart;
        this.reportMetric('TTFB', this.webVitals.ttfb);
      }
    }).observe({ entryTypes: ['navigation'] });
  },

  trackResourceTiming() {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 1000) { // Resources taking > 1s
          this.reportMetric('SlowResource', entry.duration, {
            url: entry.name,
            type: entry.initiatorType
          });
        }
      }
    }).observe({ entryTypes: ['resource'] });
  },

  trackNavigationTiming() {
    if (performance.timing) {
      const timing = performance.timing;
      const pageLoadTime = timing.loadEventEnd - timing.navigationStart;
      const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;

      this.reportMetric('PageLoadTime', pageLoadTime);
      this.reportMetric('DOMReadyTime', domReadyTime);
    }
  },

  trackMemoryUsage() {
    if (performance.memory) {
      setInterval(() => {
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
        this.reportMetric('MemoryUsage', usedJSHeapSize / totalJSHeapSize, {
          used: usedJSHeapSize,
          total: totalJSHeapSize,
          limit: jsHeapSizeLimit
        });
      }, 30000); // Every 30 seconds
    }
  },

  trackLongTasks() {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) { // Tasks > 50ms
          this.reportMetric('LongTask', entry.duration, {
            startTime: entry.startTime,
            name: entry.name
          });
        }
      }
    }).observe({ entryTypes: ['longtask'] });
  },

  reportMetric(name, value, metadata = {}) {
    const metric = {
      name,
      value,
      timestamp: Date.now(),
      metadata,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Store locally
    this.customMetrics.set(`${name}-${Date.now()}`, metric);

    // Send to analytics service (if available)
    if (window.gtag) {
      window.gtag('event', 'performance_metric', {
        event_category: 'performance',
        event_label: name,
        value: Math.round(value)
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${name}:`, value, metadata);
    }
  },

  getMetrics() {
    return {
      webVitals: this.webVitals,
      customMetrics: Array.from(this.customMetrics.values()),
      summary: this.getPerformanceSummary()
    };
  },

  getPerformanceSummary() {
    const metrics = Array.from(this.customMetrics.values());
    const recentMetrics = metrics.filter(m => Date.now() - m.timestamp < 300000); // Last 5 minutes

    return {
      averageResponseTime: this.calculateAverage(recentMetrics.filter(m => m.name === 'APIResponseTime')),
      slowResources: recentMetrics.filter(m => m.name === 'SlowResource').length,
      longTasks: recentMetrics.filter(m => m.name === 'LongTask').length,
      memoryUsage: recentMetrics.filter(m => m.name === 'MemoryUsage').slice(-1)[0]?.value || 0
    };
  },

  calculateAverage(metrics) {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }
};

// Lazy loading utilities
export const LazyLoader = {
  // Lazy load component with error boundary
  loadComponent(importFunc, fallback = null) {
    const LazyComponent = lazy(() =>
      importFunc().catch(error => {
        console.error('Failed to load component:', error);
        PerformanceMonitor.reportMetric('ComponentLoadError', 1, { error: error.message });
        return { default: () => <div>Failed to load component</div> };
      })
    );

    return (props) => (
      <Suspense fallback={fallback || <LoadingSkeleton />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  },

  // Preload component
  preloadComponent(importFunc) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = importFunc.toString().match(/import\(['"]([^'"]+)['"]\)/)?.[1];
    if (link.href) {
      document.head.appendChild(link);
    }
  },

  // Lazy load data
  loadData(fetchFunc, cacheKey, ttl = 300000) { // 5 minutes default
    return async () => {
      const cache = LazyLoader.getCache();
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }

      const startTime = Date.now();
      try {
        const data = await fetchFunc();
        const responseTime = Date.now() - startTime;

        PerformanceMonitor.reportMetric('APIResponseTime', responseTime, { cacheKey });

        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        PerformanceMonitor.reportMetric('APIFailure', 1, { cacheKey, error: error.message });
        throw error;
      }
    };
  },

  // Simple in-memory cache
  cache: new Map(),

  getCache() {
    return this.cache;
  },

  clearCache() {
    this.cache.clear();
  }
};

// Loading skeleton component
export const LoadingSkeleton = ({ type = 'default', lines = 3 }) => {
  const skeletonClasses = {
    default: 'h-4 bg-gray-200 rounded w-full mb-2',
    card: 'h-32 bg-gray-200 rounded mb-4',
    avatar: 'h-10 w-10 bg-gray-200 rounded-full',
    button: 'h-10 bg-gray-200 rounded w-24'
  };

  if (type === 'text') {
    return (
      <div className="animate-pulse">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${skeletonClasses.default} ${i === lines - 1 ? 'w-3/4' : ''}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="animate-pulse">
      <div className={skeletonClasses[type]} />
    </div>
  );
};

// Code splitting utilities
export const CodeSplitter = {
  // Split code by route
  createRouteComponent(importFunc, preload = false) {
    const Component = LazyLoader.loadComponent(importFunc);

    if (preload) {
      LazyLoader.preloadComponent(importFunc);
    }

    return Component;
  },

  // Split code by feature
  createFeatureComponent(featureName, importFunc) {
    return LazyLoader.loadComponent(importFunc, <div>Loading {featureName}...</div>);
  },

  // Dynamic imports with error handling
  dynamicImport(importFunc, errorFallback = null) {
    return importFunc().catch(error => {
      console.error('Dynamic import failed:', error);
      PerformanceMonitor.reportMetric('DynamicImportError', 1, { error: error.message });
      return errorFallback ? { default: errorFallback } : { default: () => null };
    });
  }
};

// Caching strategies
export const CacheManager = {
  // HTTP cache with service worker
  cache: new Map(),

  set(key, value, ttl = 300000) { // 5 minutes default
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  },

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  },

  clear() {
    this.cache.clear();
  },

  // Cache React Query results
  createQueryCache(queryClient) {
    return {
      set: (key, value) => {
        const cacheKey = JSON.stringify(key);
        this.set(cacheKey, value);
      },
      get: (key) => {
        const cacheKey = JSON.stringify(key);
        return this.get(cacheKey);
      },
      clear: () => this.clear()
    };
  }
};

// Image optimization utilities
export const ImageOptimizer = {
  // Lazy load images
  lazyLoadImage(src, alt, className = '', onLoad = null) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const imgRef = useRef(null);

    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              img.src = src;
              observer.unobserve(img);
            }
          });
        },
        { threshold: 0.1 }
      );

      observer.observe(img);

      return () => observer.disconnect();
    }, [src]);

    const handleLoad = () => {
      setLoaded(true);
      onLoad?.();
    };

    const handleError = () => {
      setError(true);
      PerformanceMonitor.reportMetric('ImageLoadError', 1, { src });
    };

    return (
      <img
        ref={imgRef}
        alt={alt}
        className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        onLoad={handleLoad}
        onError={handleError}
        style={{ minHeight: '1px' }} // Prevent layout shift
      />
    );
  },

  // Generate responsive image sources
  generateResponsiveSources(src, sizes = [480, 768, 1024, 1440]) {
    return {
      src,
      srcSet: sizes.map(size => `${src}?w=${size} ${size}w`).join(', '),
      sizes: '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw'
    };
  }
};

// Bundle analyzer and optimization
export const BundleAnalyzer = {
  // Analyze bundle size
  analyzeBundle() {
    if (process.env.NODE_ENV === 'development') {
      import('webpack-bundle-analyzer').then(({ BundleAnalyzerPlugin }) => {
        console.log('Bundle analyzer loaded');
      }).catch(() => {
        console.warn('Bundle analyzer not available');
      });
    }
  },

  // Report bundle metrics
  reportBundleMetrics() {
    // This would integrate with webpack build process
    PerformanceMonitor.reportMetric('BundleSize', 0, { chunks: [] });
  }
};

// Performance hooks
export const usePerformanceOptimization = () => {
  const [metrics, setMetrics] = useState(PerformanceMonitor.getMetrics());

  useEffect(() => {
    PerformanceMonitor.init();

    const interval = setInterval(() => {
      setMetrics(PerformanceMonitor.getMetrics());
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const reportCustomMetric = useCallback((name, value, metadata = {}) => {
    PerformanceMonitor.reportMetric(name, value, metadata);
  }, []);

  return { metrics, reportCustomMetric };
};

// Memory optimization hook
export const useMemoryOptimization = () => {
  const [memoryUsage, setMemoryUsage] = useState(null);

  useEffect(() => {
    if (performance.memory) {
      const updateMemory = () => {
        setMemoryUsage(performance.memory);
      };

      updateMemory();
      const interval = setInterval(updateMemory, 30000);

      return () => clearInterval(interval);
    }
  }, []);

  const forceGC = useCallback(() => {
    if (window.gc) {
      window.gc();
      console.log('Manual garbage collection triggered');
    }
  }, []);

  return { memoryUsage, forceGC };
};

// Virtualization hook for large lists
export const useVirtualization = (items, itemHeight = 50, containerHeight = 400) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerRef, setContainerRef] = useState(null);

  const visibleItems = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length
    );

    return items.slice(startIndex, endIndex).map((item, index) => ({
      ...item,
      index: startIndex + index,
      style: {
        position: 'absolute',
        top: (startIndex + index) * itemHeight,
        height: itemHeight,
        width: '100%'
      }
    }));
  }, [items, scrollTop, itemHeight, containerHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    onScroll: handleScroll,
    containerRef: setContainerRef
  };
};

// Debounced search hook
export const useDebouncedSearch = (searchFunction, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (debouncedValue) {
        setIsSearching(true);
        try {
          await searchFunction(debouncedValue);
        } finally {
          setIsSearching(false);
        }
      }
    }, delay);

    return () => clearTimeout(handler);
  }, [debouncedValue, searchFunction, delay]);

  return { setDebouncedValue, isSearching };
};

// Intersection observer hook for lazy loading
export const useIntersectionObserver = (ref, options = {}) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting && !hasIntersected) {
          setHasIntersected(true);
        }
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, options, hasIntersected]);

  return { isIntersecting, hasIntersected };
};

// Preload resources hook
export const useResourcePreloader = () => {
  const preloadImage = useCallback((src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  const preloadScript = useCallback((src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.onload = () => resolve(src);
      script.onerror = reject;
      script.src = src;
      document.head.appendChild(script);
    });
  }, []);

  const preloadStyle = useCallback((href) => {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.onload = () => resolve(href);
      link.onerror = reject;
      link.href = href;
      document.head.appendChild(link);
    });
  }, []);

  return { preloadImage, preloadScript, preloadStyle };
};

export default {
  PerformanceMonitor,
  LazyLoader,
  LoadingSkeleton,
  CodeSplitter,
  CacheManager,
  ImageOptimizer,
  BundleAnalyzer,
  usePerformanceOptimization,
  useMemoryOptimization,
  useVirtualization,
  useDebouncedSearch,
  useIntersectionObserver,
  useResourcePreloader
};