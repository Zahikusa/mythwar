import './ui/style.css';
import './ui/hud.css';
import './ui/menus.css';
import './ui/mp.css';
import { App } from './app.ts';
import { TURRETS, UNITS } from './sim/data.ts';

// iOS Safari ignores user-scalable=no; block its pinch/rotate gestures and double-tap zoom.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    if (now - lastTouchEnd < 300 && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).has('gallery')) {
  import('./gallery.ts').then((m) => m.runGallery(root));
} else {
  const app = new App(root);
  app.start();
  (window as unknown as { __mythwar: App }).__mythwar = app;
  // Handy for debugging and the screenshot / smoke scripts.
  (window as unknown as { __mythwarData: unknown }).__mythwarData = { UNITS, TURRETS };
  // Cross-engine determinism probe for scripts/enginecheck.ts (loaded on demand).
  (window as unknown as { __mythwarSelftest: unknown }).__mythwarSelftest = () => import('./selftest.ts');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
