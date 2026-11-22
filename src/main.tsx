import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppWrapper } from "./components/common/PageMeta";
import { storageService } from "./services/storageService";
import { ndusTokenService } from "./services/ndusTokenService";
import "./index.css";
Sentry.init({ dsn: import.meta.env['VITE_SENTRY_DSN'] as string | undefined, environment: import.meta.env.MODE });
async function boot() { let hasCache = false; try { hasCache = Boolean(localStorage.getItem('tb_stream_videos_v1')); } catch {} const timeout = new Promise<void>((resolve) => setTimeout(resolve, hasCache ? 2500 : 10000)); await Promise.race([Promise.allSettled([storageService.hydrateFromServer(), ndusTokenService.refresh()]), timeout]); storageService.startBackgroundSync(); createRoot(document.getElementById("root")!).render(<Sentry.ErrorBoundary fallback={<p style={{ padding: 24, color: '#ddd', fontFamily: 'sans-serif' }}>Something went wrong. Please refresh the page.</p>}><AppWrapper><App /></AppWrapper></Sentry.ErrorBoundary>); }
void boot();
