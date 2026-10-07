import {captchaToken} from './captcha';
import {setupPlayer} from './meditation-player';
import {recordingLabel} from '../lib/audio';
import {bindLiquidInteraction, unbindLiquidInteraction} from './liquid-interaction';

type Recording = {id: string; title: string; excerpt: string; recordingType?: string; customRecordingType?: string; audioUrl: string; imageUrl?: string};
const root = document.querySelector<HTMLElement>('[data-resources-access]');
if (root) setupAccess(root);
function setupAccess(root: HTMLElement) {
  const gate = root.querySelector<HTMLElement>('[data-resources-gate]')!;
  const content = root.querySelector<HTMLElement>('[data-resources-content]')!;
  const mount = root.querySelector<HTMLElement>('[data-resources-mount]')!;
  const template = root.querySelector<HTMLTemplateElement>('[data-resources-library-template]')!;
  const form = root.querySelector<HTMLFormElement>('[data-resources-login]')!;
  const password = form.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = root.querySelector<HTMLElement>('[data-resources-status]')!;
  const logout = root.querySelector<HTMLButtonElement>('[data-resources-logout]')!;
  const logoutLabel = logout.querySelector<HTMLElement>('[data-lock-label]')!;
  const lockStatus = root.querySelector<HTMLElement>('[data-lock-status]')!;
  const padlock = logout.querySelector<SVGElement>('[data-padlock]')!;
  const shackle = logout.querySelector<SVGElement>('[data-padlock-shackle]')!;
  let lockAnimations: Animation[] = [];
  let cleanup: (() => void) | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const api = (path: string, body?: object) => fetch('/api/resources/' + path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  function lock(message = '', focus = false) {
    generation++;
    clearTimeout(expiry); cleanup?.(); cleanup = undefined;
    mount.querySelectorAll<HTMLElement>('[data-liquid]').forEach(unbindLiquidInteraction);
    mount.replaceChildren(); content.hidden = true; gate.hidden = false; status.textContent = message;
    lockAnimations.forEach(animation => animation.cancel()); lockAnimations = [];
    logout.hidden = true; logout.disabled = false; logoutLabel.textContent = 'Lock resources';
    lockStatus.textContent = ''; content.inert = false;
    password.value = '';
    if (focus) password.focus({preventScroll: true});
  }
  async function load(focus = false) {
    const current = ++generation;
    const response = await api('catalog');
    if (current !== generation) return;
    if (response.status === 401) { lock(); return; }
    if (!response.ok) throw new Error('The recordings are temporarily unavailable. Please try again shortly.');
    const {items, expires}: {items: Recording[]; expires: number} = await response.json();
    if (current !== generation) return;
    lock();
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const library = fragment.querySelector<HTMLElement>('[data-meditation-library]')!;
    const grid = library.querySelector<HTMLElement>('.meditation-grid')!;
    const cardTemplate = library.querySelector<HTMLTemplateElement>('[data-recording-template]')!;
    for (const [index, item] of items.entries()) {
      if (!/^[a-f0-9]{64}$/.test(item.id) || item.audioUrl !== `/api/resources/audio/${item.id}`) continue;
      const card = cardTemplate.content.cloneNode(true) as DocumentFragment;
      const button = card.querySelector<HTMLButtonElement>('[data-meditation-card]')!;
      const excerpt = card.querySelector<HTMLElement>('.meditation-excerpt')!;
      excerpt.id = `recording-excerpt-${index}`; excerpt.textContent = item.excerpt;
      button.dataset.descriptionId = excerpt.id; button.dataset.title = item.title; button.dataset.audioUrl = item.audioUrl;
      button.setAttribute('aria-label', `Play ${item.title}`);
      card.querySelectorAll<HTMLElement>('.meditation-title, h2').forEach(el => { el.textContent = item.title; });
      card.querySelectorAll<HTMLElement>('[data-recording-label]').forEach(el => { el.textContent = recordingLabel(item.recordingType, item.customRecordingType); });
      if (item.imageUrl === `/api/resources/image/${item.id}`) {
        const image = card.querySelector<HTMLImageElement>('[data-recording-image]')!;
        image.src = item.imageUrl; image.hidden = false;
        card.querySelector<HTMLElement>('[data-recording-placeholder]')!.hidden = true;
        button.dataset.artwork = item.imageUrl;
      }
      grid.append(card);
    }
    cardTemplate.remove();
    library.querySelector<HTMLElement>('[data-recordings-empty]')!.hidden = !!grid.children.length;
    mount.append(fragment); gate.hidden = true; content.hidden = false;
    logout.hidden = false;
    cleanup = setupPlayer(library);
    library.querySelectorAll<HTMLElement>('[data-liquid]').forEach(el => bindLiquidInteraction(el, motion));
    // Clear already-delivered content and stop buffered playback when the session expires.
    expiry = setTimeout(() => lock('Your session has ended. Enter the book password to keep listening.', true), Math.max(0, expires - Date.now()));
    if (focus) logout.focus({preventScroll: true});
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; status.textContent = 'Unlocking…';
    try {
      const challenge = await api('challenge');
      if (!challenge.ok) { status.textContent = 'Unable to start sign-in. Please try again shortly.'; return; }
      const token = root.dataset.siteKey ? await captchaToken(root.dataset.siteKey, 'resources_login') : undefined;
      const response = await api('login', {password: password.value, token});
      password.value = '';
      const data = await response.json();
      if (!response.ok) { status.textContent = data.message || 'Unable to unlock. Please try again.'; password.focus(); return; }
      await load(true);
    } catch { status.textContent = 'Unable to connect. Please try again shortly.'; }
    finally { submit.disabled = false; }
  });
  logout.addEventListener('click', async () => {
    const current = generation;
    let revoked = false;
    logout.disabled = true;
    logoutLabel.textContent = 'Locking resources'; lockStatus.textContent = '';
    content.inert = true;
    try {
      const response = await api('logout', {});
      if (current !== generation) return;
      if (!response.ok) {
        lockStatus.textContent = 'Could not lock resources. Please try again.';
        return;
      }
      revoked = true;
      cleanup?.(); cleanup = undefined;
      // The session is already revoked; only the visual return waits for the lock.
      if (!motion.matches) {
        lockAnimations = [
          shackle.animate([{transform: 'translateY(-4px)'}, {transform: 'translateY(1px)', offset: .8}, {transform: 'translateY(0)'}],
            {duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards'}),
          padlock.animate([{transform: 'translateY(0)'}, {transform: 'translateY(2px)', offset: .3}, {transform: 'translateY(0)'}],
            {delay: 330, duration: 260, easing: 'ease-out', fill: 'forwards'}),
        ];
        await Promise.all(lockAnimations.map(animation => animation.finished.catch(() => {})));
      }
      if (current === generation) lock('Resources are locked.', true);
    } catch {
      if (current === generation) {
        if (revoked) lock('Resources are locked.', true);
        else lockStatus.textContent = 'Could not lock resources. Please try again.';
      }
    } finally {
      if (current === generation) { logout.disabled = false; logoutLabel.textContent = 'Lock resources'; content.inert = false; }
    }
  });
  // Never restore protected DOM from the back/forward cache without rechecking the server.
  window.addEventListener('pagehide', () => lock());
  window.addEventListener('pageshow', event => { if (event.persisted) void load().catch(() => lock('Please unlock Resources again.')); });
  void load().catch(() => { status.textContent = 'Resources are temporarily unavailable. Please try again shortly.'; });
}
