# Archie Generated App - React 19 + shadcn/ui Template

Modern React 19 application template with TypeScript, Vite, Tailwind CSS, shadcn/ui, and i18next.

> Coding agent (Cursor, Copilot, Claude Code, Codex, …) working in this repo? Read `AGENTS.md`
> first — it covers the project layout, the backend/SDK boundary, and what not to hand-edit.

## 🚀 Features

- ⚡️ **React 19** - Latest React with new features
- 🔨 **Vite 6** - Lightning fast build tool
- 🎨 **Tailwind CSS v4** - Utility-first CSS with Vite plugin (faster)
- 🧩 **shadcn/ui** - 45+ Beautiful, accessible components
- 🎣 **Custom Hooks** - 8 production-ready hooks (useMobile, useDebounce, etc.)
- 🌐 **i18next** - Internationalization support (EN/ES)
- 🌗 **Dark/Light Mode** - Built-in theme switching
- 🎯 **TypeScript** - Type safety throughout
- 🎭 **Lucide Icons** - 2000+ beautiful icons
- 🎬 **Framer Motion** - Production-ready animations
- 📦 **CSS Variables** - No hardcoded colors
- ♿ **Accessibility** - WCAG 2.1 compliant components
- 📱 **Responsive** - Mobile-first design
- 🔔 **Toast Notifications** - Built-in with sonner

## 📦 Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| React | 19.0.0 | UI Library |
| Vite | 6.0.7 | Build Tool |
| Bun | 1.0+ | Runtime & Package Manager (Recommended) |
| TypeScript | 6.0.3 (API) + 7.0.2 (nativo, `tsc`) | Type Safety |
| Tailwind CSS | 4.1.17 | Styling (v4 with Vite plugin) |
| react-i18next | 15.2.2 | i18n |
| Lucide React | 0.454.0 (pinned) | Icons |
| Framer Motion | 12.23.26 | Animations |
| react-icons | 5.4.0 | OAuth & Brand Icons (Google, Microsoft, Facebook, Apple) |
| @radix-ui/* | Latest | Accessible Primitives |

## 🧭 TypeScript: dos compiladores

Este template usa **dos paquetes de TypeScript a la vez**, cada uno para un trabajo distinto:

- **`tsc` (bin) → `@typescript/native` (TypeScript 7.0.2, nativo en Go).** Es el que corren `bun run build` (`tsc -b`) y `bun run build:check` (`tsc --noEmit`). 5-9x más rápido que el compilador JS, según la corrida (medido con `tsc -b --force`).
- **`typescript` (paquete, `require('typescript')`) → 6.0.3 plano.** Da la API programática JS que usa `typescript-eslint` (peer `typescript: ">=4.8.4 <6.1.0"`, no acepta TS 7 todavía) y el `tsserver` que usa tu editor.

**No usamos el alias oficial de Microsoft** (`typescript: npm:@typescript/typescript6@...`) porque su dependencia anidada `@typescript/old` se resuelve mal en bun 1.3.x (queda apuntando a sí misma en vez del compilador real de TS 6, y `require('typescript')` devuelve `{}` — rompe `eslint`).

**Invariante a respetar:** cuando dos paquetes declaran `bin.tsc`, el gestor de paquetes enlaza `node_modules/.bin/tsc` a la clave que ordena primero alfabéticamente — hoy `@typescript/native` gana porque `@` ordena antes que `typescript`. No renombres ese alias ni añadas un paquete `@algo-anterior-alfabético` con `bin.tsc`: en el peor caso perderías la velocidad (volvería a TS 6), nunca rompería el build. Nota para contenedores sin `node` en el `PATH`: el shim de `node_modules/.bin/tsc` tiene shebang de node, así que invócalo como `bun run tsc` / `bunx tsc`, no por ruta directa.

## 🎭 lucide-react: pinned to the Kit's exact version

`lucide-react` is pinned to the **exact** version `0.454.0` (no caret) — the exact version that `@8base-archie/kit-runtime` depends on as an ordinary dependency. The conversion copies a project's Kit component plane verbatim into this template and builds it here; if this template's `lucide-react` drifts ahead of the Kit's pinned version, icons the Kit imports can be removed upstream (e.g. `Pocket` was removed by `lucide-react@1.8.0`), producing a Vite `[MISSING_EXPORT]` build failure.

**Rule:** bump `lucide-react` and `@8base-archie/kit-runtime` together, never independently. Before bumping, confirm the new `lucide-react` version still exports every icon the current Kit runtime imports.

### Included shadcn/ui Components

✅ **Forms**: Input, Label, Textarea, Checkbox, Switch, Select  
✅ **Overlays**: Dialog, Alert Dialog, Sheet  
✅ **Feedback**: Alert, Badge, Skeleton  
✅ **Layout**: Card, Button, Separator, Table

## 🏗️ Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui (CLI registry only; no custom forks)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   └── theme-provider.tsx
├── hooks/               # Custom React hooks (8 hooks)
│   ├── use-mobile.tsx
│   ├── use-debounce.tsx
│   ├── use-clipboard.tsx
│   ├── use-local-storage.tsx
│   ├── use-media-query.tsx
│   ├── use-intersection-observer.tsx
│   ├── use-scroll-lock.tsx
│   ├── use-toast.ts
│   └── index.ts
├── i18n/
│   ├── config.ts        # i18next configuration
│   └── locales/
│       ├── en.json      # English translations
│       └── es.json      # Spanish translations
├── lib/
│   ├── utils.ts         # Utility functions (cn)
│   └── animations.ts    # Framer Motion animation utilities (25+ variants)
├── styles/
│   └── globals.css      # Global styles & CSS variables
├── App.tsx              # Main application
└── main.tsx             # Entry point
```

## 🎨 Design Token System

This template uses a **CSS Variable-based Design Token System** that enables full theming from the blueprint.

### Token Categories

| Category | Variables | Purpose |
|----------|-----------|---------|
| **Core Colors** | `--primary`, `--secondary`, `--accent`, `--muted` | Brand colors |
| **Semantic State** | `--success`, `--warning`, `--info`, `--destructive` | Status indicators |
| **Layout** | `--radius`, `--radius-sm`, `--radius-lg` | Border radii |
| **Typography** | `--font-sans`, `--font-heading`, `--font-mono` | Font stacks |
| **Animation** | `--duration-fast`, `--duration-normal` | Transition durations |

### Using Semantic Tokens (REQUIRED)

```tsx
// ✅ CORRECT - Use semantic tokens
<div className="bg-success text-success-foreground">Success</div>
<div className="text-warning border-warning">Warning</div>
<div className="bg-info/10 text-info">Info</div>
<div className="bg-destructive text-destructive-foreground">Error</div>

// ❌ WRONG - Never use Tailwind color classes directly
<div className="bg-green-500">...</div>  // FORBIDDEN
<div className="text-blue-600">...</div> // FORBIDDEN
<div className="bg-red-50">...</div>     // FORBIDDEN
```

### How It Works

1. **Template** defines default CSS variables in `globals.css`
2. **DesignSystemGenerator** replaces values from `blueprint.uxUi`
3. **Components** use semantic classes (`bg-success`, `text-warning`)
4. **Dark mode** works automatically via `.dark` CSS class

### Contract Reference

See `archie-code-genesis/src/genesis-module/domain/contracts/design-tokens.contract.ts` for the full interface that defines which tokens MUST exist.

## ⚡ Performance with Bun

Using Bun provides several performance improvements:

| Operation | Improvement | Notes |
|-----------|-------------|-------|
| **Dependency Installation** | **2-4x faster** | `bun install` is significantly faster than npm/pnpm |
| **Dev Server Startup** | **20-30% faster** | Faster process execution and module loading |
| **Hot Module Replacement** | **10-15% faster** | Quicker file watching and updates |
| **Build Time** | **10-20% faster** | Faster script execution (Vite/esbuild still do the heavy lifting) |
| **Type Checking** | **Similar speed** | TypeScript compiler speed is similar |

**Bottom line:** Bun makes the development experience noticeably faster, especially for dependency management and dev server operations. The build itself is moderately faster, but Vite already does most of the optimization work.

## 🚦 Getting Started

### Prerequisites

- **Node.js 18+ or 20+** (for npm/yarn/pnpm)
- **Bun 1.0+** (recommended for faster performance)

### Installation

#### Using Bun (Recommended) 🚀

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies (much faster than npm/pnpm)
bun install

# Start development server
bun run dev

# Server runs on http://localhost:3000
```

#### Using npm/pnpm/yarn

```bash
# Install dependencies
npm install
# or
pnpm install
# or
yarn install
```

### Development

#### With Bun
```bash
# Run dev server (use 'bun run' or just 'bun' for scripts)
bun run dev
# or simply (Bun allows omitting 'run' for scripts)
bun dev
```

**Important:** Always use `bun run <script>` or `bun <script>` for npm scripts. Don't use `bun build` directly (that's Bun's native bundler, not your npm script).

#### With npm/pnpm/yarn
```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

### Build

#### With Bun (Recommended - Faster)
```bash
# Full build with type checking (recommended for production)
bun run build

# Fast build without type checking (faster, for quick iterations)
bun run build:fast

# Build with type checking only (no emit)
bun run build:check
```

**⚠️ Important:** Always use `bun run build` (not just `bun build`). The command `bun build` is Bun's native bundler and requires entrypoints - it won't run your npm script.

#### With npm/pnpm/yarn
```bash
npm run build
```

**Note:** Bun executes scripts faster than Node.js, providing a **10-20% speed improvement** in build times. The biggest improvement is in dependency installation (2-4x faster).

### Preview Production Build

```bash
# With Bun
bun run preview

# With npm/pnpm/yarn
npm run preview
```

### Lint

```bash
# With Bun
bun run lint

# With npm/pnpm/yarn
npm run lint
```

## 🎨 Theming

### CSS Variables

All colors are defined using CSS variables in `src/styles/globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  /* ... */
}
```

### Using Theme

```tsx
import { useTheme } from '@/components/theme-provider'

function MyComponent() {
  const { theme, setTheme } = useTheme()
  
  return (
    <button onClick={() => setTheme('dark')}>
      Toggle Theme
    </button>
  )
}
```

## 🌐 Internationalization

### Add New Language

1. Create translation file: `src/i18n/locales/fr.json`
2. Import in `src/i18n/config.ts`:

```ts
import frTranslations from './locales/fr.json'

i18n.init({
  resources: {
    en: { translation: enTranslations },
    es: { translation: esTranslations },
    fr: { translation: frTranslations }, // Add new language
  },
  // ...
})
```

### Usage

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t, i18n } = useTranslation()
  
  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <button onClick={() => i18n.changeLanguage('es')}>
        Cambiar a Español
      </button>
    </div>
  )
}
```

## 🎣 Custom Hooks Included

This template comes with **8 production-ready custom hooks**:

### Responsive & Media Queries
- **`useMobile()`** - Detect mobile viewport (< 768px)
- **`useTablet()`** - Detect tablet viewport (768-1023px)
- **`useDesktop()`** - Detect desktop viewport (>= 1024px)
- **`useMediaQuery(query)`** - Track any media query

### Performance
- **`useDebounce(value, delay)`** - Debounce values for search/input
- **`useIntersectionObserver(options)`** - Lazy loading, infinite scroll

### Data & Interaction
- **`useLocalStorage(key, initial)`** - Persist state with sync
- **`useClipboard(options)`** - Copy to clipboard with feedback
- **`useScrollLock(locked)`** - Lock scroll for modals
- **`toast`** - Enhanced toast notifications (sonner wrapper)

### Quick Examples

```tsx
import { useMobile, useDebounce, toast } from '@/hooks';

function MyComponent() {
  const isMobile = useMobile();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (debouncedSearch) {
      toast.promise(fetchResults(debouncedSearch), {
        loading: 'Searching...',
        success: 'Results loaded!',
        error: 'Search failed'
      });
    }
  }, [debouncedSearch]);

  return isMobile ? <MobileView /> : <DesktopView />;
}
```

📖 **Full documentation**: See `src/hooks/README.md`

---

## 🎬 Animation Utilities

This template includes **25+ pre-configured Framer Motion animation variants** in `src/lib/animations.ts`:

### Available Animations

| Category | Variants | Description |
|----------|----------|-------------|
| **Fade** | `fadeIn`, `fadeInScale` | Basic opacity transitions |
| **Slide** | `slideUp`, `slideDown`, `slideLeft`, `slideRight` | Directional slides with opacity |
| **Stagger** | `staggerContainer`, `staggerContainerFast`, `staggerContainerSlow` | Parent containers for staggered children |
| **Items** | `staggerItem`, `staggerItemScale` | Child items for stagger animations |
| **Hover** | `hoverScale`, `hoverScaleLarge`, `hoverLift` | Interactive hover effects |
| **Tap** | `tapScale`, `tapScaleSmall` | Press/tap feedback |
| **Page** | `pageTransition`, `pageSlideUp` | Page-level transitions |
| **Modal** | `modalBackdrop`, `modalContent` | Dialog/modal animations |
| **Misc** | `shimmer`, `notification`, `collapse` | Skeleton loading, toasts, accordions |

### Usage Examples

```tsx
import { motion } from 'motion/react';
import { 
  fadeIn, 
  slideUp, 
  staggerContainer, 
  staggerItem,
  hoverScale,
  tapScale 
} from '@/lib/animations';

// Page entrance animation
function Dashboard() {
  return (
    <motion.main 
      variants={fadeIn} 
      initial="hidden" 
      animate="visible"
    >
      <h1>Dashboard</h1>
    </motion.main>
  );
}

// Staggered list animation
function CardList({ items }) {
  return (
    <motion.ul 
      variants={staggerContainer} 
      initial="hidden" 
      animate="visible"
      className="grid grid-cols-3 gap-4"
    >
      {items.map(item => (
        <motion.li key={item.id} variants={staggerItem}>
          <Card>{item.name}</Card>
        </motion.li>
      ))}
    </motion.ul>
  );
}

// Interactive card with hover/tap
function InteractiveCard({ children }) {
  return (
    <motion.div 
      whileHover={hoverScale} 
      whileTap={tapScale}
      className="cursor-pointer"
    >
      {children}
    </motion.div>
  );
}

// Slide up entrance
function SlideUpSection() {
  return (
    <motion.section 
      variants={slideUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      Content appears when scrolled into view
    </motion.section>
  );
}
```

### Best Practices

- ✅ Use `variants` for declarative animations
- ✅ Use `staggerContainer` + `staggerItem` for lists
- ✅ Use `hoverScale`/`tapScale` for interactive feedback
- ✅ Use `viewport={{ once: true }}` for scroll-triggered animations
- ❌ Don't animate layout properties unnecessarily (expensive)
- ❌ Don't use very long durations (keep < 500ms)

---

## 🔐 OAuth Icons (react-icons)

This template includes `react-icons` for OAuth/social login buttons:

```tsx
import { FcGoogle } from 'react-icons/fc';           // Google (colored)
import { BsMicrosoft } from 'react-icons/bs';        // Microsoft
import { FaFacebook, FaApple } from 'react-icons/fa'; // Facebook, Apple

function OAuthButtons() {
  return (
    <div className="space-y-2">
      <Button variant="outline" className="w-full">
        <FcGoogle className="mr-2 h-5 w-5" />
        Continue with Google
      </Button>
      <Button variant="outline" className="w-full">
        <BsMicrosoft className="mr-2 h-5 w-5 text-[#00a4ef]" />
        Continue with Microsoft
      </Button>
      <Button variant="outline" className="w-full">
        <FaFacebook className="mr-2 h-5 w-5 text-[#1877f2]" />
        Continue with Facebook
      </Button>
      <Button variant="outline" className="w-full">
        <FaApple className="mr-2 h-5 w-5" />
        Continue with Apple
      </Button>
    </div>
  );
}
```

---

## 🎨 Pre-built Special Components

In addition to shadcn/ui components, this template includes **production-ready components**:

### `<NotFound />` - Modern 404 Page
- ✨ Animated entrance with motion (motion/react)
- 🎯 Floating geometric elements
- 🔙 Navigation options (Go Home, Go Back)
- 📱 Fully responsive
- 🎨 Gradient text effects

### `<ModuleComingSoon />` - Coming Soon Placeholder
- ⚡ Animated skeleton preview
- 🌈 Glass morphism effects
- 🎭 Floating badge animations
- 📊 Preview cards layout
- 💫 Gradient backgrounds
- 🎯 Perfect for modules under development

**Usage:**
```tsx
import { NotFound, ModuleComingSoon } from '@/components';

// 404 Route
<Route path="*" element={<NotFound />} />

// Coming Soon Module
<ModuleComingSoon 
  moduleName="Analytics Dashboard"
  description="Advanced metrics coming soon"
/>
```

---

## 🧩 Components Included

This template comes with **45 pre-installed shadcn/ui components**:

### Forms & Inputs
- `<Input />` - Text input field
- `<Label />` - Accessible form label
- `<Textarea />` - Multi-line text input
- `<Checkbox />` - Checkbox with indeterminate state
- `<Switch />` - Toggle switch
- `<Select />` - Dropdown select with search

### Dialogs & Overlays
- `<Dialog />` - Modal dialog
- `<AlertDialog />` - Alert/confirmation dialog
- `<Sheet />` - Slide-out panel (left/right/top/bottom)

### Feedback & Status
- `<Alert />` - Alert message (default/destructive)
- `<Badge />` - Status badge
- `<Skeleton />` - Loading skeleton

### Layout & Data
- `<Button />` - Button with variants
- `<Card />` - Card container
- `<Separator />` - Divider line
- `<Table />` - Data table

### Usage Examples

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

function MyForm() {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      
      <Alert>
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>Your changes have been saved.</AlertDescription>
      </Alert>
      
      <div className="flex gap-2">
        <Button>Submit</Button>
        <Badge>New</Badge>
      </div>
    </div>
  )
}
```

### Adding More Components

To add additional shadcn/ui components:

#### With Bun
```bash
bunx shadcn@latest add [component-name]
```

#### With npm/pnpm/yarn
```bash
npx shadcn@latest add [component-name]
```

Examples:
```bash
# With Bun
bunx shadcn@latest add calendar
bunx shadcn@latest add dropdown-menu
bunx shadcn@latest add popover

# With npm/pnpm/yarn
npx shadcn@latest add calendar
npx shadcn@latest add dropdown-menu
npx shadcn@latest add popover
```

### Custom Components

Create in `src/components/` and import:

```tsx
import { MyComponent } from '@/components/MyComponent'
```

## 📝 Best Practices

### ✅ DO

- Use CSS variables for colors (`bg-primary`, `text-foreground`)
- Use shadcn/ui components from `@/components/ui/*`
- Use custom hooks from `@/hooks`
- Use Lucide icons
- Keep components small and focused
- Use TypeScript strictly
- Use i18next for all user-facing text
- Use `toast` from `@/hooks` for notifications

### ❌ DON'T

- Hardcode colors (`bg-blue-500`, `#3b82f6`)
- Use inline styles for colors
- Mix different UI libraries
- Use `any` type in TypeScript
- Hardcode text strings
- Recreate hooks that already exist in `@/hooks`

## 🔧 Configuration

### Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMobile, toast } from '@/hooks'
```

### Tailwind configuration (v4, CSS-first)

There is no `tailwind.config.js` in this template. Extend the design system in **`src/styles/globals.css`**: set CSS variables under `:root` / `.dark`, map utilities in the `@theme` block, or add `@utility` as needed. See [Tailwind v4 CSS configuration](https://tailwindcss.com/docs/configuration).

## 📚 Learn More

- [React 19 Documentation](https://react.dev)
- [Vite Documentation](https://vite.dev)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [i18next Documentation](https://www.i18next.com)
- [Lucide Icons](https://lucide.dev)

## 📄 License

This template is part of the Archie Code Generation system.

---

**Generated by Archie** - AI-Powered Application Generator

