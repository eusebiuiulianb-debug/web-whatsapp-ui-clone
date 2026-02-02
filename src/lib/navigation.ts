/**
 * Navigation helpers for preserving scroll position and return paths
 */

const POPCLIPS_RETURN_TO_KEY = 'popclips_returnTo';
const POPCLIPS_SCROLL_Y_KEY = 'popclips_scrollY';

/**
 * Save current scroll position and return path before navigating to viewer
 */
export function saveViewerNavigationState(returnTo?: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    window.sessionStorage.setItem(POPCLIPS_SCROLL_Y_KEY, String(scrollY));
    
    if (returnTo) {
      window.sessionStorage.setItem(POPCLIPS_RETURN_TO_KEY, returnTo);
    } else {
      // Save current location as return path
      const currentPath = window.location.pathname + window.location.search;
      window.sessionStorage.setItem(POPCLIPS_RETURN_TO_KEY, currentPath);
    }
  } catch (_err) {
    // Ignore storage errors
  }
}

/**
 * Restore scroll position from saved state
 */
export function restoreViewerScrollPosition(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const savedScrollY = window.sessionStorage.getItem(POPCLIPS_SCROLL_Y_KEY);
    if (savedScrollY) {
      const scrollY = Number(savedScrollY);
      if (Number.isFinite(scrollY)) {
        // Use requestAnimationFrame to ensure DOM is ready
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY, behavior: 'auto' });
        });
      }
      // Clear after restoring
      window.sessionStorage.removeItem(POPCLIPS_SCROLL_Y_KEY);
    }
  } catch (_err) {
    // Ignore storage errors
  }
}

/**
 * Get saved return path
 */
export function getViewerReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    return window.sessionStorage.getItem(POPCLIPS_RETURN_TO_KEY);
  } catch (_err) {
    return null;
  }
}

/**
 * Clear saved navigation state
 */
export function clearViewerNavigationState(): void {
  if (typeof window === 'undefined') return;
  
  try {
    window.sessionStorage.removeItem(POPCLIPS_RETURN_TO_KEY);
    window.sessionStorage.removeItem(POPCLIPS_SCROLL_Y_KEY);
  } catch (_err) {
    // Ignore storage errors
  }
}

/**
 * Build return URL with returnTo parameter
 */
export function buildReturnUrl(baseUrl: string, returnTo?: string | null): string {
  if (!returnTo) return baseUrl;
  
  try {
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    url.searchParams.set('returnTo', returnTo);
    return url.pathname + url.search;
  } catch (_err) {
    return baseUrl;
  }
}
