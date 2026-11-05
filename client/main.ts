import './styles/base.css';
import { startApp } from './app.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');
startApp(root);
