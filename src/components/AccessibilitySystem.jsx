/**
 * Comprehensive Accessibility Compliance System for AutoVolt
 * Ensures WCAG 2.1 AA compliance with automated testing and remediation
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Accessibility utilities
export const AccessibilityUtils = {
  // Generate unique IDs for ARIA relationships
  generateId: (prefix = 'autovolt') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  // Check if element is visible to screen readers
  isVisibleToScreenReader: (element) => {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.getAttribute('aria-hidden') !== 'true';
  },

  // Get all focusable elements in container
  getFocusableElements: (container = document) => {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'iframe',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ];

    return Array.from(container.querySelectorAll(focusableSelectors.join(',')))
      .filter(el => AccessibilityUtils.isVisibleToScreenReader(el));
  },

  // Trap focus within container
  trapFocus: (container, initialFocus = null) => {
    const focusableElements = AccessibilityUtils.getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = initialFocus || focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }

      if (e.key === 'Escape') {
        // Allow escape to close modal/dialog
        const closeButton = container.querySelector('[data-close-button]');
        if (closeButton) {
          closeButton.click();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Focus initial element
    setTimeout(() => firstElement.focus(), 10);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  },

  // Announce content to screen readers
  announce: (message, priority = 'polite', container = document.body) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';

    container.appendChild(announcement);
    announcement.textContent = message;

    // Remove after announcement
    setTimeout(() => {
      if (container.contains(announcement)) {
        container.removeChild(announcement);
      }
    }, 1000);
  },

  // Check color contrast
  checkColorContrast: (foreground, background) => {
    // Convert hex to RGB
    const getRGB = (color) => {
      const hex = color.replace('#', '');
      return {
        r: parseInt(hex.substr(0, 2), 16),
        g: parseInt(hex.substr(2, 2), 16),
        b: parseInt(hex.substr(4, 2), 16)
      };
    };

    const fg = getRGB(foreground);
    const bg = getRGB(background);

    // Calculate relative luminance
    const getLuminance = (rgb) => {
      const { r, g, b } = rgb;
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const l1 = getLuminance(fg);
    const l2 = getLuminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      ratio: Math.round(ratio * 100) / 100,
      AA: ratio >= 4.5,
      AAA: ratio >= 7
    };
  }
};

// Skip link component
export const SkipLink = ({ href, children }) => (
  <a
    href={href}
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
    onFocus={(e) => {
      // Ensure the target element exists and is focusable
      const target = document.querySelector(href);
      if (target) {
        target.setAttribute('tabindex', '-1');
      }
    }}
  >
    {children}
  </a>
);

// Accessible button component
export const AccessibleButton = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'medium',
  ariaLabel,
  ariaDescribedBy,
  ...props
}) => {
  const buttonId = useRef(AccessibilityUtils.generateId('button'));
  const loadingId = useRef(AccessibilityUtils.generateId('loading'));

  const handleClick = useCallback((e) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }, [onClick, disabled, loading]);

  const buttonClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };

  const sizeClasses = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg'
  };

  return (
    <button
      id={buttonId.current}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${buttonClasses[variant]} ${sizeClasses[size]}`}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-describedby={loading ? loadingId.current : ariaDescribedBy}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      <span id={loadingId.current} className="sr-only">
        {loading ? 'Loading' : ''}
      </span>
      {children}
    </button>
  );
};

// Accessible modal component
export const AccessibleModal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnOverlayClick = true
}) => {
  const modalRef = useRef(null);
  const titleId = useRef(AccessibilityUtils.generateId('modal-title'));
  const contentId = useRef(AccessibilityUtils.generateId('modal-content'));

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus trap
      const cleanup = AccessibilityUtils.trapFocus(modalRef.current);

      // Announce modal opening
      AccessibilityUtils.announce(`${title} dialog opened`);

      return () => {
        document.body.style.overflow = 'unset';
        cleanup();
      };
    }
  }, [isOpen, title]);

  const handleOverlayClick = useCallback((e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-lg',
    large: 'max-w-2xl',
    full: 'max-w-full'
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId.current}
      aria-describedby={contentId.current}
    >
      <div
        ref={modalRef}
        className={`w-full ${sizeClasses[size]} bg-white rounded-lg shadow-xl`}
        role="document"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id={titleId.current} className="text-xl font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            aria-label="Close modal"
            data-close-button
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div id={contentId.current} className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// Accessible form field component
export const AccessibleField = ({
  label,
  error,
  required = false,
  description,
  children,
  id: providedId
}) => {
  const fieldId = useRef(providedId || AccessibilityUtils.generateId('field'));
  const errorId = useRef(AccessibilityUtils.generateId('error'));
  const descriptionId = useRef(AccessibilityUtils.generateId('description'));

  const hasError = !!error;
  const hasDescription = !!description;

  return (
    <div className="space-y-1">
      <label
        htmlFor={fieldId.current}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>

      {hasDescription && (
        <p
          id={descriptionId.current}
          className="text-sm text-gray-500"
        >
          {description}
        </p>
      )}

      <div className="relative">
        {React.cloneElement(children, {
          id: fieldId.current,
          'aria-invalid': hasError,
          'aria-describedby': [
            hasError ? errorId.current : null,
            hasDescription ? descriptionId.current : null
          ].filter(Boolean).join(' ') || undefined
        })}
      </div>

      {hasError && (
        <p
          id={errorId.current}
          className="text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  );
};

// Accessibility checker hook
export const useAccessibilityChecker = () => {
  const [violations, setViolations] = useState([]);

  const checkAccessibility = useCallback(async () => {
    const newViolations = [];

    // Check for missing alt text
    const images = document.querySelectorAll('img:not([alt])');
    images.forEach((img, index) => {
      newViolations.push({
        id: `img-alt-${index}`,
        type: 'error',
        message: 'Image missing alt text',
        element: img,
        wcag: '1.1.1',
        suggestion: 'Add descriptive alt text or alt="" for decorative images'
      });
    });

    // Check for missing form labels
    const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
    inputs.forEach((input, index) => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (!label) {
        newViolations.push({
          id: `input-label-${index}`,
          type: 'error',
          message: 'Form input missing label',
          element: input,
          wcag: '1.3.1',
          suggestion: 'Add a label element or aria-label attribute'
        });
      }
    });

    // Check color contrast
    const textElements = document.querySelectorAll('*');
    textElements.forEach((element, index) => {
      const style = window.getComputedStyle(element);
      const color = style.color;
      const backgroundColor = style.backgroundColor;

      if (color && backgroundColor && color !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const contrast = AccessibilityUtils.checkColorContrast(color, backgroundColor);
        if (!contrast.AA) {
          newViolations.push({
            id: `contrast-${index}`,
            type: 'warning',
            message: `Insufficient color contrast (${contrast.ratio}:1)`,
            element,
            wcag: '1.4.3',
            suggestion: 'Increase contrast to at least 4.5:1 for AA compliance'
          });
        }
      }
    });

    // Check heading hierarchy
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      if (level - lastLevel > 1 && lastLevel !== 0) {
        newViolations.push({
          id: `heading-hierarchy-${index}`,
          type: 'warning',
          message: `Skipped heading level (h${lastLevel} to h${level})`,
          element: heading,
          wcag: '1.3.1',
          suggestion: 'Ensure proper heading hierarchy without skipping levels'
        });
      }
      lastLevel = level;
    });

    setViolations(newViolations);
    return newViolations;
  }, []);

  useEffect(() => {
    // Run accessibility check on mount and route changes
    checkAccessibility();
  }, [checkAccessibility]);

  return { violations, checkAccessibility };
};

// Route change announcer
export const RouteAnnouncer = () => {
  const location = useLocation();

  useEffect(() => {
    // Announce page changes to screen readers
    const pageTitle = document.title || 'AutoVolt';
    AccessibilityUtils.announce(`Navigated to ${pageTitle}`, 'assertive');
  }, [location.pathname]);

  return null;
};

// High contrast mode hook
export const useHighContrast = () => {
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    // Check for high contrast mode preference
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    setIsHighContrast(mediaQuery.matches);

    const handleChange = (e) => setIsHighContrast(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isHighContrast;
};

// Reduced motion hook
export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
};

// Focus management hook
export const useFocusManagement = () => {
  const [focusedElement, setFocusedElement] = useState(null);

  useEffect(() => {
    const handleFocus = (e) => {
      setFocusedElement(e.target);
    };

    const handleBlur = () => {
      setFocusedElement(null);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  const focusElement = useCallback((element) => {
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
  }, []);

  const trapFocus = useCallback((container) => {
    return AccessibilityUtils.trapFocus(container);
  }, []);

  return { focusedElement, focusElement, trapFocus };
};

// Keyboard navigation hook
export const useKeyboardNavigation = (onEnter, onEscape, onArrowKeys) => {
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'Enter':
        if (onEnter) {
          e.preventDefault();
          onEnter(e);
        }
        break;
      case 'Escape':
        if (onEscape) {
          e.preventDefault();
          onEscape(e);
        }
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        if (onArrowKeys) {
          e.preventDefault();
          onArrowKeys(e.key, e);
        }
        break;
    }
  }, [onEnter, onEscape, onArrowKeys]);

  return handleKeyDown;
};

export default {
  AccessibilityUtils,
  SkipLink,
  AccessibleButton,
  AccessibleModal,
  AccessibleField,
  useAccessibilityChecker,
  RouteAnnouncer,
  useHighContrast,
  useReducedMotion,
  useFocusManagement,
  useKeyboardNavigation
};