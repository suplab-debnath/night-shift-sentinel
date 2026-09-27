import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Offline build (ARCHITECTURE §9): one self-contained index.html that runs from file://.
 * A strict Content-Security-Policy makes "no network at runtime" enforced by the browser:
 * no fetch/XHR/WebSocket, fonts and images only from inlined data: URIs.
 */
const OFFLINE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function offlineCsp(): Plugin {
  return {
    name: 'night-shift-offline-csp',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    plugins: offline ? [react(), viteSingleFile({ removeViteModuleLoader: true }), offlineCsp()] : [react()],
    base: './',
    build: {
      outDir: offline ? 'dist-offline' : 'dist',
      emptyOutDir: true,
      // One page, shipped as a single offline file: a large chunk is expected.
      chunkSizeWarningLimit: 1500,
      // Inline every asset (the woff2 fonts included) into the single file.
      assetsInlineLimit: offline ? 100_000_000 : 4096,
      cssCodeSplit: !offline,
    },
    server: {
      // Live mode (P6) proxies /api to the local server.
      proxy: mode === 'live' ? { '/api': process.env.NIGHT_SHIFT_API ?? 'http://localhost:8787' } : undefined,
    },
  };
});
