'use client';

import { ComponentType, lazy, Suspense, ReactNode } from 'react';

interface LazyLoadProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * LazyLoad Component
 * 
 * Wrapper component for lazy loading heavy components to reduce initial bundle size.
 * Use this for components that are not immediately visible or are used conditionally.
 * 
 * @example
 * const HeavyComponent = lazy(() => import('./HeavyComponent'));
 * 
 * <LazyLoad fallback={<LoadingSpinner />}>
 *   <HeavyComponent />
 * </LazyLoad>
 */
export function LazyLoad({ children, fallback = <div className="animate-pulse">Loading...</div> }: LazyLoadProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

/**
 * Helper to create preloadable lazy components
 * 
 * @example
 * export const preloadableChart = preloadable(() => import('./Chart'));
 * // Preload: preloadableChart.load()
 * // Use: <preloadableChart.Component />
 */
export function preloadable<T extends ComponentType<unknown>>(
  importFunc: () => Promise<{ default: T }>
) {
  return {
    load: importFunc,
    Component: lazy(importFunc),
  };
}




