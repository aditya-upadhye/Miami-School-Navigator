import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/globals.css";
import "leaflet/dist/leaflet.css";
import "./i18n/config";
import "./lib/archie-design-runtime";
import "./lib/archie-host-bridge";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { ArchieDevToolProvider } from "@archie/devtools/client";
import { createClient, ArchieProvider } from "@archie/react-sdk";
import App, { router } from "./App.tsx";
import { appDefaultTheme, appThemeKey, migrateLegacyTheme } from "./lib/theme-key";

const queryClient = new QueryClient();

// Per-app theme key (ARCH-2770): `<app>.theme`, so two Archie apps on one domain do not share a choice. The index.html script already
// applied it before first paint; the migration here covers a page served without that script (copies the legacy keys once).
migrateLegacyTheme(appThemeKey());

// Sentinels used only when VITE_ARCHIE_PROJECT_ID / VITE_ARCHIE_API_URL are
// absent at build time, so the client below always has something well-formed
// to construct with. `createClient` only hard-validates `projectId` (throws
// `projectId is required` if falsy) and does not parse `apiUrl` as a URL at
// all — it is just string-concatenated into request paths — so a syntactically
// valid but unroutable UUID/host is enough to satisfy the SDK and let it fail
// at the network layer instead of at construction. `.invalid` is the
// RFC 2606 TLD reserved for exactly this: guaranteed-unresolvable hostnames.
const ARCHIE_SENTINEL_PROJECT_ID = "00000000-0000-0000-0000-000000000000";
const ARCHIE_SENTINEL_API_URL = "http://archie.invalid";

// The provider is structural, not conditional: every hook in `@archie/react-sdk`
// (`useArchieClient`, `useAuth`, `useQuery`, …) throws "must be used within an
// <ArchieProvider>" the instant it renders without one, and emitted app code
// calls those hooks unconditionally. Whether real Archie config is *present* is
// a runtime concern — gv2 no longer inlines credentials as literals (ARCH-1372:
// zero credentials in files), so the `.env` a preview materializes can legally
// omit VITE_ARCHIE_* — but whether the provider *exists* cannot depend on that,
// or the app blank-screens the moment any generated component touches the SDK.
// So: always mount `<ArchieProvider>`; fall back to sentinel config when the
// real values are missing, and warn once so the gap is visible without being fatal.
const archieProjectId = import.meta.env.VITE_ARCHIE_PROJECT_ID as
  | string
  | undefined;
const archieApiUrl = import.meta.env.VITE_ARCHIE_API_URL as string | undefined;
const hasArchieConfig = Boolean(archieProjectId && archieApiUrl);

if (!hasArchieConfig) {
  console.warn(
    "[archie] VITE_ARCHIE_* ausentes en build: la app corre sin backend Archie (revisa env_vars del proyecto)"
  );
}

const archieEnv = {
  projectId: archieProjectId ?? ARCHIE_SENTINEL_PROJECT_ID,
  apiUrl: archieApiUrl ?? ARCHIE_SENTINEL_API_URL,
  environment:
    (import.meta.env.VITE_ARCHIE_ENVIRONMENT as string | undefined) ?? "master",
  apiKey: import.meta.env.VITE_ARCHIE_API_KEY as string | undefined,
  // Credencial de las llamadas de identidad SIN sesión (signup/login). Separada de
  // `apiKey` a propósito: se mintea con un solo rol, EXECUTE sobre el componente de
  // identidad y nada más, mientras que `apiKey` carga los roles de datos de la
  // superficie pública. Ambas se bakean en el bundle, así que el camino de identidad
  // no puede tomar prestada la más ancha.
  //
  // Ausente cuando el proyecto no tiene Archie Identity activo — un caso legítimo, no
  // una misconfiguración. Por eso no se valida acá: el SDK falla nombrándola si una
  // llamada de identidad la necesita y no está.
  identityApiKey: import.meta.env.VITE_ARCHIE_IDENTITY_API_KEY as
    | string
    | undefined,
};
const archieClient = createClient({
  projectId: archieEnv.projectId,
  apiUrl: archieEnv.apiUrl,
  environment: archieEnv.environment,
  apiKey: archieEnv.apiKey,
  identityApiKey: archieEnv.identityApiKey,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ArchieProvider client={archieClient}>
        <ThemeProvider defaultTheme={appDefaultTheme()} storageKey={appThemeKey()}>
          <ArchieDevToolProvider router={router}>
            <App />
          </ArchieDevToolProvider>
          {/* The one Toaster of the app (FEED.10): screens only call `toast`. Inside
              ThemeProvider because it reads the theme. Never mount a second one. */}
          <Toaster />
        </ThemeProvider>
      </ArchieProvider>
    </QueryClientProvider>
  </StrictMode>
);
