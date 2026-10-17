import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  freezeOnceVisible?: boolean;
}

/**
 * Hook to observe element visibility using IntersectionObserver
 * Useful for lazy loading, infinite scroll, animations on scroll, etc.
 * 
 * @param options - IntersectionObserver options
 * @returns [ref, isIntersecting, entry] - Ref to attach to element, visibility state, and observer entry
 * 
 * @example
 * const [ref, isVisible] = useIntersectionObserver({ threshold: 0.5 });
 * 
 * <div ref={ref}>
 *   {isVisible ? <HeavyComponent /> : <Skeleton />}
 * </div>
 */
export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [React.RefObject<T | null>, boolean, IntersectionObserverEntry | null] {
  const { threshold = 0, root = null, rootMargin = '0px', freezeOnceVisible = false } = options;

  const elementRef = useRef<T>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const supportsIO = typeof window !== 'undefined' && 'IntersectionObserver' in window;
  const [isIntersecting, setIsIntersecting] = useState(!supportsIO);
  
  const frozen = freezeOnceVisible && isIntersecting;

  useEffect(() => {
    const element = elementRef.current;
    if (!element || frozen || !supportsIO) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, frozen, supportsIO]);

  return [elementRef, isIntersecting, entry];
}
