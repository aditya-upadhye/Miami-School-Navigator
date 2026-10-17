import { useEffect } from 'react';

/**
 * Hook to lock/unlock body scroll
 * Useful for modals, drawers, and overlays
 * 
 * @param isLocked - Whether to lock scroll
 * 
 * @example
 * const [isOpen, setIsOpen] = useState(false);
 * useScrollLock(isOpen);
 * 
 * // Or manually control
 * const { lock, unlock } = useScrollLock();
 * <Button onClick={lock}>Lock Scroll</Button>
 */
export function useScrollLock(isLocked: boolean = false): {
  lock: () => void;
  unlock: () => void;
} {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    if (isLocked) {
      // Prevent scroll on body
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      
      document.body.style.overflow = 'hidden';
      
      // Prevent layout shift by adding padding
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isLocked]);

  const lock = () => {
    if (typeof window === 'undefined') return;
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  };

  const unlock = () => {
    if (typeof window === 'undefined') return;
    
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  };

  return { lock, unlock };
}
