/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { attachMultiplayer } from './server/net.ts';
import { splashLinks } from './scripts/splashsizes.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/** `npm run dev` / `npm run preview` host multiplayer rooms too (same as `npm run lan`). */
function multiplayer(): Plugin {
  return {
    name: 'mythwar-multiplayer',
    configureServer(server) {
      if (server.httpServer) {
        const mp = attachMultiplayer(server.httpServer as import('node:http').Server, { sharedUpgrades: true });
        server.httpServer.on('close', () => mp.close());
      }
    },
    configurePreviewServer(server) {
      const mp = attachMultiplayer(server.httpServer as import('node:http').Server, { sharedUpgrades: true });
      server.httpServer.on('close', () => mp.close());
    },
  };
}

/** The installed app's launch images on iPhone and iPad (scripts/splash.ts draws them). */
function launchImages(): Plugin {
  return {
    name: 'mythwar-launch-images',
    transformIndexHtml: () =>
      splashLinks().map((s) => ({ tag: 'link', attrs: { rel: 'apple-touch-startup-image', media: s.media, href: `./${s.file}` }, injectTo: 'head' as const })),
  };
}

export default defineConfig({
  base: './',
  plugins: [multiplayer(), launchImages()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
  },
  test: {
    // Only the project's own tests (not scratch copies under .tmp/).
    include: ['tests/**/*.test.ts'],
  },
});
