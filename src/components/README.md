# Custom Components

This directory contains custom, production-ready components for common use cases.

## 📁 Available Components

### 1. `NotFound.tsx` - 404 Error Page

A modern, animated 404 page with smooth transitions and multiple navigation options.

**Features:**
- ✨ Animated entrance and floating elements
- 🎨 Gradient text with primary color
- 🔙 Navigation: Go Home & Go Back buttons
- 📱 Fully responsive design
- 🎭 Framer Motion animations

**Usage:**
**Props (public API, keep stable):** `inShell?: boolean` (fill the shell slot instead of the viewport; use it when the catch-all sits under a layout), `homeHref?: string` (primary action target, default `/`; point it at the collection the missing page belonged to).

**A11y:** renders `<main>` when standalone and a labelled `<section>` with `inShell` (the shell owns `<main>`); "Go back" falls back to `homeHref` when there is no history.

**i18n:** copy comes from `notFound.title|body|home|back` (`src/i18n/locales/{en,es}.json`). English defaults are built in, so a catalog without the keys never shows raw keys.

```tsx
import { NotFound } from '@/components';

// In your router configuration
const router = createBrowserRouter([
  // ... other routes
  {
    path: '*',
    element: <NotFound />
  }
]);
```

**Preview:**
- Large animated "404" with gradient
- Floating circular borders (skipped under `prefers-reduced-motion`)
- Two action buttons (Home & Back)

---

### 2. `ModuleComingSoon.tsx` - Coming Soon Placeholder

Beautiful "under development" component with skeleton preview and glass morphism effects.

**Features:**
- ⚡ Animated skeleton cards preview
- 🌈 Glass morphism with gradient background
- 💫 Floating badge with "Under Development"
- 🎨 Customizable module name and description
- 📊 Professional skeleton layout
- 🎭 Smooth entrance animations

**Props:**
```tsx
interface ModuleComingSoonProps {
  moduleName?: string;      // Default: "Module"
  description?: string;     // Optional extra description
  showSkeleton?: boolean;   // Default: true
}
```

**Usage Examples:**

```tsx
import { ModuleComingSoon } from '@/components';

// Basic usage
<ModuleComingSoon />

// With custom module name
<ModuleComingSoon moduleName="Analytics Dashboard" />

// Full customization
<ModuleComingSoon 
  moduleName="Analytics Dashboard"
  description="Advanced metrics, charts, and insights coming soon"
  showSkeleton={true}
/>

// Without skeleton preview
<ModuleComingSoon 
  moduleName="Settings"
  showSkeleton={false}
/>
```

**Use Cases:**
- Placeholder for modules under development
- Beta features announcement
- Restricted features (premium, coming soon)
- Maintenance pages
- Teaser for upcoming features

**Preview:**
- Sparkles icon with glow effect
- "Under Development" badge
- Module name with gradient text
- Description text
- 3 animated skeleton cards (grid layout)
- Large skeleton preview card
- Footer message with rocket icon

---

### 3. Shared components (`page-head`, `status-chip`, `theme-control`, `empty-state`)

Typed, stable public APIs built on `ui/*`; apg's lib wraps them and gv2 admits them (ARCH-2680). Props are documented in each file's JSDoc: keep them stable. Copy is passed in already translated, except `ThemeControl` which ships `themeControl.*` (EN/ES, English fallback built in). `UploadField` is not here yet (ARCH-2737).

| Component | Rules | Notes |
|---|---|---|
| `PageHead` | HEAD.1-8 | single `<h1>`; `back`, `breadcrumb`, `status`, `meta`, `actions`, `tabs`; full width |
| `StatusChip` | TBL.10 | `label` + `tone` (`ok info pending warn danger neutral`) over the `--status-*` tokens; not a button |
| `ThemeControl` | PRO.9, PRO.10, PRO.17 | `variant`: `segmented-icons` (default), `segmented-labels`, `preview-cards`, `select`, `submenu`, `radio-items` (the last two go inside a `DropdownMenuContent`). `role="radiogroup"`, arrow keys, tooltips, caption. Drives `ThemeProvider` (per-app `<app>.theme` key from `lib/theme-key`, `dark` class) unless `value`/`onValueChange` are passed |
| `EmptyState` | STATE.6, HEAD.16 | `title`, `description`, `icon`, `action`; the add action lives here, not also in the page head |

```tsx
import { PageHead, StatusChip, ThemeControl, EmptyState } from '@/components';
```

Pure rules live in `*.policy.ts` (unit-testable); tests in `shared-components.test.tsx`. Motion: only colour transitions, disabled under `prefers-reduced-motion`.

---

## 🎨 Design Principles

All components follow these principles:

1. **Motion First**: Smooth animations using motion (motion/react)
2. **Responsive**: Mobile-first design, works on all devices
3. **Themeable**: Respects light/dark mode via CSS variables
4. **Accessible**: Semantic HTML and proper ARIA labels
5. **Modern**: 2025 design trends (glass morphism, gradients, floating elements)
6. **Reusable**: Props for customization without code changes

---

## 🚀 Adding More Components

When adding custom components to this directory:

1. **Use TypeScript** - Always type your props
2. **Export from `index.ts`** - Add to central exports
3. **Add JSDoc comments** - Document props and usage
4. **Use existing patterns** - Follow the style of NotFound/ModuleComingSoon
5. **Leverage the stack**:
   - `motion/react` for animations
   - `lucide-react` for icons
   - `@/components/ui/*` for base components
   - `@/hooks` for common logic
   - Tailwind CSS for styling

**Example structure:**
```tsx
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useMobile } from '@/hooks';

interface MyComponentProps {
  // Props with JSDoc
}

/**
 * Component description
 * @example
 * <MyComponent prop="value" />
 */
export function MyComponent({ }: MyComponentProps) {
  const isMobile = useMobile();
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Component content */}
    </motion.div>
  );
}
```

---

## 📚 Resources

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Lucide Icons](https://lucide.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)

---

**Last Updated**: 2025-12-05  
**Components**: NotFound, ModuleComingSoon, PageHead, StatusChip, ThemeControl, EmptyState

