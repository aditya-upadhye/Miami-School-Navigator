import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseClipboardOptions {
  timeout?: number;
  successMessage?: string;
  errorMessage?: string;
  showToast?: boolean;
}

interface UseClipboardReturn {
  copied: boolean;
  copy: (text: string) => Promise<void>;
  reset: () => void;
}

/**
 * Hook to copy text to clipboard with feedback
 * @param options - Configuration options
 * @returns Object with copied state, copy function, and reset function
 * 
 * @example
 * const { copied, copy } = useClipboard({ timeout: 2000 });
 * 
 * <Button onClick={() => copy('Hello World')}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </Button>
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const {
    timeout = 2000,
    successMessage = 'Copied to clipboard',
    errorMessage = 'Failed to copy',
    showToast = true,
  } = options;

  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string) => {
      try {
        // Modern clipboard API
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          const successful = document.execCommand('copy');
          textArea.remove();
          
          if (!successful) {
            throw new Error('Fallback copy failed');
          }
        }

        setCopied(true);
        if (showToast) {
          toast.success(successMessage);
        }

        // Reset after timeout
        setTimeout(() => {
          setCopied(false);
        }, timeout);
      } catch (error) {
        console.error('Failed to copy:', error);
        setCopied(false);
        if (showToast) {
          toast.error(errorMessage);
        }
      }
    },
    [timeout, successMessage, errorMessage, showToast]
  );

  const reset = useCallback(() => {
    setCopied(false);
  }, []);

  return { copied, copy, reset };
}
