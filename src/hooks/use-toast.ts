import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * Enhanced toast hook wrapping sonner for better DX
 * Re-exports all sonner functionality with typed helpers
 * 
 * @example
 * // Option 1: Direct import (recommended)
 * import { toast } from '@/hooks/use-toast';
 * toast.success('Profile updated!');
 * 
 * // Option 2: As hook
 * import { useToast } from '@/hooks/use-toast';
 * const { toast } = useToast();
 * toast.error('Something went wrong');
 */

export const toast = {
  /**
   * Show a success toast
   */
  success: (message: string, options?: ExternalToast) => {
    return sonnerToast.success(message, options);
  },

  /**
   * Show an error toast
   */
  error: (message: string, options?: ExternalToast) => {
    return sonnerToast.error(message, options);
  },

  /**
   * Show an info toast
   */
  info: (message: string, options?: ExternalToast) => {
    return sonnerToast.info(message, options);
  },

  /**
   * Show a warning toast
   */
  warning: (message: string, options?: ExternalToast) => {
    return sonnerToast.warning(message, options);
  },

  /**
   * Show a loading toast
   */
  loading: (message: string, options?: ExternalToast) => {
    return sonnerToast.loading(message, options);
  },

  /**
   * Show a default toast
   */
  message: (message: string, options?: ExternalToast) => {
    return sonnerToast(message, options);
  },

  /**
   * Show a promise toast with loading/success/error states
   */
  promise: <T>(
    promise: Promise<T>,
    options: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: Error) => string);
    }
  ) => {
    return sonnerToast.promise(promise, options);
  },

  /**
   * Dismiss a specific toast by ID
   */
  dismiss: (toastId?: string | number) => {
    return sonnerToast.dismiss(toastId);
  },

  /**
   * Custom toast with full control
   * @param render - Function that receives toast id and returns JSX
   * @example
   * toast.custom((id) => (
   *   <div className="flex gap-2">
   *     <span>Custom content</span>
   *     <button onClick={() => toast.dismiss(id)}>Close</button>
   *   </div>
   * ))
   */
  custom: (
    render: (id: number | string) => React.ReactElement,
    options?: ExternalToast
  ) => {
    return sonnerToast.custom(render, options);
  },
};

/**
 * Hook version of toast for compatibility
 * @returns Object with toast methods
 * 
 * @example
 * const { toast } = useToast();
 * toast.success('Done!');
 */
export function useToast() {
  return { toast };
}
