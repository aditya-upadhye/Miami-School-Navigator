import { LoaderCircle } from 'lucide-react';

/**
 * Loading fallback component for Suspense boundaries
 * Displays while lazy-loaded components are being fetched
 * 
 * @example
 * <Suspense fallback={<LoadingFallback />}>
 *   <LazyComponent />
 * </Suspense>
 */
export function LoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoaderCircle className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

