import './ui/style.css';
import './ui/hud.css';
import './ui/menus.css';
import { App } from './app.ts';

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).has('gallery')) {
  import('./gallery.ts').then((m) => m.runGallery(root));
} else {
  const app = new App(root);
  app.start();
  (window as unknown as { __mythwar: App }).__mythwar = app;
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
