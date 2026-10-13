import './ui/style.css';
import './ui/hud.css';
import './ui/menus.css';
import './ui/mp.css';
import { App } from './app.ts';
import { holdPageStill } from './stillpage.ts';
import { watchForUpdate } from './update.ts';
import { TURRETS, UNITS } from './sim/data.ts';

holdPageStill();

const root = document.getElementById('app')!;
if ((window as unknown as { __mythwarTooOld?: boolean }).__mythwarTooOld) {
  // (index.html's check said so on screen: no game to start in this browser.)
} else if (new URLSearchParams(location.search).has('gallery')) {
  import('./gallery.ts').then((m) => m.runGallery(root));
} else {
  const app = new App(root);
  app.start();
  (window as unknown as { __mythwar: App }).__mythwar = app;
  watchForUpdate(() => app.menus.updateReady());
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
