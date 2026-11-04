import './styles/base.css';
import type { ServerInfo } from '../shared/types.js';
import { renderShareCard } from './ui/share.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app not found');

root.innerHTML = `
  <header class="sign">
    <h1 class="neon">Truco de Boteco</h1>
    <p class="tagline">Truco Paulista com a galera, na mesma rede.</p>
  </header>
  <section class="panel" aria-live="polite">
    <p class="muted">Procurando a rede…</p>
  </section>
  <p class="muted small">Mesa em construção. Em breve: criar sala, sentar e jogar.</p>
`;

const panel = root.querySelector<HTMLElement>('.panel');

async function loadInfo(): Promise<void> {
  if (!panel) return;
  try {
    const res = await fetch('/api/info');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = (await res.json()) as ServerInfo;
    panel.replaceChildren(renderShareCard(info));
  } catch {
    panel.innerHTML = `<p class="error">Não consegui falar com o servidor. Ele está rodando?</p>`;
  }
}

void loadInfo();
