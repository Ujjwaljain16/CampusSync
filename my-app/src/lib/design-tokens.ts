/**
 * CampusSync Design System - Design Tokens
 * Based on the logo colors: Blue (#3B82F6) and Green (#10B981)
 * Modern, professional, and consistent across all pages
 */

export const designTokens = {
  // Brand Colors - Derived from CampusSync logo
  colors: {
    // Primary (Blue from logo)
    primary: {
      50: '#EFF6FF',
      100: '#DBEAFE',
      200: '#BFDBFE',
      300: '#93C5FD',
      400: '#60A5FA',
      500: '#3B82F6', // Main blue from logo
      600: '#2563EB',
      700: '#1D4ED8',
      800: '#1E40AF',
      900: '#1E3A8A',
      950: '#172554',
    },
    
    // Secondary (Green from logo)
    secondary: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981', // Main green from logo
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
      950: '#022C22',
    },
    
    // Accent Colors
    accent: {
      purple: {
        500: '#8B5CF6',
        600: '#7C3AED',
      },
      orange: {
        500: '#F59E0B',
        600: '#D97706',
      },
      pink: {
        500: '#EC4899',
        600: '#DB2777',
      },
    },
    
    // Semantic Colors
    success: {
      light: '#D1FAE5',
      DEFAULT: '#10B981',
      dark: '#047857',
    },
    warning: {
      light: '#FEF3C7',
      DEFAULT: '#F59E0B',
      dark: '#D97706',
    },
    error: {
      light: '#FEE2E2',
      DEFAULT: '#EF4444',
      dark: '#DC2626',
    },
    info: {
      light: '#DBEAFE',
      DEFAULT: '#3B82F6',
      dark: '#1D4ED8',
    },
    
    // Neutral Colors (Dark theme)
    neutral: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
      950: '#020617',
    },
  },
  
  // Typography
  typography: {
    fonts: {
      sans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: 'var(--font-geist-mono), Menlo, Monaco, "Courier New", monospace',
      display: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    
    sizes: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
      '6xl': '3.75rem',   // 60px
      '7xl': '4.5rem',    // 72px
    },
    
    weights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    
    lineHeights: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  
  // Spacing
  spacing: {
    xs: '0.5rem',    // 8px
    sm: '0.75rem',   // 12px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
    '4xl': '6rem',   // 96px
  },
  
  // Border Radius
  radius: {
    none: '0',
    sm: '0.375rem',    // 6px
    DEFAULT: '0.5rem', // 8px
    md: '0.75rem',     // 12px
    lg: '1rem',        // 16px
    xl: '1.5rem',      // 24px
    '2xl': '2rem',     // 32px
    full: '9999px',
  },
  
  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    DEFAULT: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    md: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '2xl': '0 35px 60px -15px rgba(0, 0, 0, 0.3)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    none: 'none',
    
    // Colored shadows for CTA buttons
    primary: '0 10px 25px -5px rgba(59, 130, 246, 0.4)',
    secondary: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
    glow: '0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(16, 185, 129, 0.2)',
  },
  
  // Transitions
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    DEFAULT: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slowest: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  
  // Z-Index Scale
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    tooltip: 1600,
    toast: 1700,
  },
  
  // Gradients
  gradients: {
    brand: 'linear-gradient(135deg, #3B82F6 0%, #10B981 100%)',
    brandReverse: 'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',
    brandVertical: 'linear-gradient(to bottom, #3B82F6 0%, #10B981 100%)',
    purple: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
    sunset: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)',
    ocean: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
    forest: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    dark: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
  },
  
  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

// Helper functions for gradient generation
export const createGradient = (color1: string, color2: string, angle = 135) => 
  `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 100%)`;

// Theme variants
export const themeVariants = {
  background: {
    primary: 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900',
    secondary: 'bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900',
    dark: 'bg-slate-900',
    light: 'bg-slate-50',
  },
  
  card: {
    glass: 'bg-white/5 backdrop-blur-xl border border-white/10',
    solid: 'bg-slate-800 border border-slate-700',
    gradient: 'bg-gradient-to-br from-blue-500/10 to-emerald-500/10 backdrop-blur-xl border border-white/10',
  },
  
  button: {
    primary: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
    secondary: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
    brand: 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600',
    ghost: 'bg-white/5 hover:bg-white/10 backdrop-blur-sm',
    outline: 'border-2 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white',
  },
  
  text: {
    gradient: 'bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent',
    primary: 'text-white',
    secondary: 'text-slate-300',
    muted: 'text-slate-400',
    brand: 'text-blue-400',
  },
} as const;

export default designTokens;
