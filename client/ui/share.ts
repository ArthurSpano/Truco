import type { ServerInfo } from '../../shared/types.js';

/**
 * "Chama a galera" card: the LAN URL plus a QR code friends can scan.
 * Reused by the lobby.
 */
export function renderShareCard(info: ServerInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = 'share';

  const primary = info.urls[0];
  if (!primary) {
    card.innerHTML = `
      <h2>Sem rede</h2>
      <p class="muted">Conecte este computador ao Wi-Fi ou ao hotspot do celular e recarregue.</p>`;
    return card;
  }

  const title = document.createElement('h2');
  title.textContent = 'Chama a galera';

  const qr = document.createElement('img');
  qr.className = 'qr';
  qr.src = '/api/qr.svg';
  qr.alt = `QR code para ${primary.url}`;
  qr.width = 200;
  qr.height = 200;

  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = 'Aponte a câmera ou digite no navegador:';

  const url = document.createElement('a');
  url.className = 'url';
  url.href = primary.url;
  url.textContent = primary.url.replace(/^https?:\/\//, '');

  card.append(title, qr, hint, url);

  const others = info.urls.slice(1).filter((a) => !a.virtual);
  if (others.length > 0) {
    const list = document.createElement('p');
    list.className = 'muted small';
    list.textContent = `Não abriu? Tente: ${others.map((a) => a.url).join(' · ')}`;
    card.append(list);
  }
  return card;
}
