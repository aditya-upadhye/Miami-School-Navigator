# Custom React Hooks

This directory contains production-ready custom hooks for common use cases in React applications.

## 📦 Installation

All hooks are already installed and configured. Simply import from `@/hooks`:

```tsx
import { useMobile, useDebounce, toast } from '@/hooks';
```

---

## 🎣 Available Hooks

### 📱 Responsive & Media Queries

#### `useMediaQuery(query: string)`
Track any media query match with SSR support.

```tsx
const isWide = useMediaQuery('(min-width: 1280px)');
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
```

#### `useMobile()`, `useTablet()`, `useDesktop()`
Pre-configured breakpoint detectors using Tailwind defaults.

```tsx
const isMobile = useMobile();   // < 768px
const isTablet = useTablet();   // 768px - 1023px
const isDesktop = useDesktop(); // >= 1024px

return isMobile ? <MobileNav /> : <DesktopNav />;
```

---

### ⚡ Performance & Optimization

#### `useDebounce<T>(value: T, delay?: number)`
Debounce rapidly changing values (great for search inputs).

```tsx
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 300);

useEffect(() => {
  // This only runs 300ms after user stops typing
  fetchResults(debouncedSearch);
}, [debouncedSearch]);
```

#### `useIntersectionObserver(options?)`
Detect when elements enter/exit viewport (lazy loading, infinite scroll, animations).

```tsx
const [ref, isVisible] = useIntersectionObserver({
  threshold: 0.5,
  freezeOnceVisible: true,
});

return (
  <div ref={ref}>
    {isVisible ? <HeavyComponent /> : <Skeleton />}
  </div>
);
```

**Options:**
- `threshold` - Percentage of visibility (0-1)
- `rootMargin` - Margin around root (e.g., '100px')
- `freezeOnceVisible` - Stop observing once visible

---

### 💾 Data Persistence

#### `useLocalStorage<T>(key: string, initialValue: T)`
Persist state in localStorage with type safety and cross-tab sync.

```tsx
const [user, setUser, removeUser] = useLocalStorage('user', {
  name: 'Guest',
  theme: 'dark',
});

// Update
setUser({ name: 'John', theme: 'light' });

// Remove
removeUser();
```

**Features:**
- ✅ Type-safe
- ✅ SSR compatible
- ✅ Cross-tab synchronization
- ✅ Error handling
- ✅ JSON serialization

---

### 🎨 User Interactions

#### `useClipboard(options?)`
Copy text to clipboard with visual feedback and toast notifications.

```tsx
const { copied, copy } = useClipboard({
  timeout: 2000,
  showToast: true,
  successMessage: 'Copied!',
});

<Button onClick={() => copy(shareUrl)}>
  {copied ? 'Copied!' : 'Share'}
</Button>
```

**Options:**
- `timeout` - How long to show "copied" state (default: 2000ms)
- `showToast` - Show sonner toast (default: true)
- `successMessage` - Custom success message
- `errorMessage` - Custom error message

#### `useScrollLock(isLocked?: boolean)`
Lock/unlock body scroll for modals and overlays.

```tsx
// Automatic mode
const [isOpen, setIsOpen] = useState(false);
useScrollLock(isOpen);

// Manual mode
const { lock, unlock } = useScrollLock();

<Button onClick={lock}>Lock Scroll</Button>
```

**Features:**
- ✅ Prevents layout shift
- ✅ Calculates scrollbar width
- ✅ Restores original state

---

### 🔔 Notifications

#### `toast` / `useToast()` (enhanced sonner wrapper)
Type-safe toast notifications with better DX. Works both ways:

```tsx
// Option 1: Direct import (recommended)
import { toast } from '@/hooks';

toast.success('Profile updated!');
toast.error('Failed to save');
toast.info('New message');
toast.warning('Low storage');
toast.loading('Uploading...');

// Option 2: As hook (for compatibility)
import { useToast } from '@/hooks';

function MyComponent() {
  const { toast } = useToast();
  
  const handleSave = async () => {
    toast.success('Saved!');
  };
}

// Promise toast
toast.promise(
  fetchData(),
  {
    loading: 'Loading...',
    success: 'Loaded!',
    error: 'Failed to load',
  }
);

// Dismiss
const toastId = toast.success('Hello');
toast.dismiss(toastId);
```

---

## 💡 Usage Tips

### Combine Hooks for Powerful Patterns

```tsx
export function SearchComponent() {
  const isMobile = useMobile();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [results, setResults] = useLocalStorage('search-results', []);

  useEffect(() => {
    if (debouncedQuery) {
      fetchResults(debouncedQuery).then(data => {
        setResults(data);
        toast.success(`Found ${data.length} results`);
      });
    }
  }, [debouncedQuery]);

  return isMobile ? <MobileSearch /> : <DesktopSearch />;
}
```

### Infinite Scroll Pattern

```tsx
export function InfiniteList() {
  const [ref, isVisible] = useIntersectionObserver({ threshold: 0 });
  
  useEffect(() => {
    if (isVisible) {
      loadMoreItems();
    }
  }, [isVisible]);

  return (
    <div>
      {items.map(item => <Item key={item.id} {...item} />)}
      <div ref={ref}>Loading more...</div>
    </div>
  );
}
```

---

## 🎯 Best Practices

1. **Always use the provided hooks** instead of recreating them
2. **Import from `@/hooks`** for convenience and tree-shaking
3. **Check SSR compatibility** - all hooks handle `window` checks
4. **Combine hooks** for complex features
5. **Type your state** when using `useLocalStorage`

---

## 📚 Resources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [React Hooks Best Practices](https://react.dev/learn)
- [sonner (Toast Library)](https://sonner.emilkowal.ski)

---

**Last Updated**: 2025-12-04  
**Version**: 1.0.0
