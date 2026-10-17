import * as React from 'react';
import { useMediaQuery } from './use-media-query';

const MOBILE_BREAKPOINT = 768;

function subscribeMobile(onChange: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getMobileSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * apg's shadcn `use-mobile` hook (consumed by ui/sidebar). `false` on the server / first
 * render, then tracks `window.innerWidth`.
 * @returns boolean - true when the viewport is narrower than 768px
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false);
}

/**
 * Hook to detect if the device is mobile
 * Uses Tailwind's default breakpoint (768px)
 * @returns boolean - true if viewport is mobile size
 * 
 * @example
 * const isMobile = useMobile();
 * return isMobile ? <MobileView /> : <DesktopView />;
 */
export function useMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * Hook to detect tablet size (768px - 1023px)
 * @returns boolean - true if viewport is tablet size
 */
export function useTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/**
 * Hook to detect desktop size (1024px+)
 * @returns boolean - true if viewport is desktop size
 */
export function useDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
