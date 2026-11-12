import './styles/base.css';
import './styles/cards.css';
import './styles/scene.css';
import './styles/themes/praca.css';
import './styles/themes/gramado.css';
import './styles/table.css';
import './styles/bubbles.css';
import './styles/animations.css';
import { startApp } from './app.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');
startApp(root);
