import './ui/style.css';
import './ui/hud.css';
import './ui/menus.css';
import { App } from './app.ts';

const root = document.getElementById('app')!;
const app = new App(root);
app.start();
(window as unknown as { __mythwar: App }).__mythwar = app;
