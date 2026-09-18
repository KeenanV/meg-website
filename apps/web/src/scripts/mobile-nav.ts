import { restoreDialogFocus } from './input-method';
import { syncMobileScene } from './mobile-scene';

const trigger = document.querySelector<HTMLButtonElement>('#open-menu');
const closeButton = document.querySelector<HTMLButtonElement>('#close-menu');
const dialog = document.querySelector<HTMLElement>('#mobile-menu');
const panel = dialog?.querySelector<HTMLElement>('.mobile-menu-panel');
const backdrop = dialog?.querySelector<HTMLElement>('.mobile-menu-backdrop');

if (trigger && closeButton && dialog && panel && backdrop) {
  const desktop = window.matchMedia('(min-width: 768px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const timing = { duration: 450, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both' as const };
  let previousOverflow = '';
  let animations: Animation[] = [];
  let revision = 0;
  let closing = false;
  let destination: string | undefined;
  let inertSiblings: Array<{ element: HTMLElement; wasInert: boolean }> = [];

  function finishClose() {
    ++revision;
    animations.forEach(animation => animation.cancel());
    animations = [];
    closing = false;
    dialog!.hidden = true;
    panel!.style.transform = 'translateX(-100%)';
    backdrop!.style.opacity = '0';
    trigger!.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = previousOverflow;
    inertSiblings.forEach(({ element, wasInert }) => { element.inert = wasInert; });
    inertSiblings = [];
    if (!desktop.matches) restoreDialogFocus(trigger!);
    const next = destination;
    destination = undefined;
    if (next) location.assign(next);
  }

  async function slide(opening: boolean) {
    const run = ++revision;
    // Read the current frame before cancelling, so dismissing during the opening
    // animation reverses from its actual position rather than jumping sideways.
    const fromTransform = getComputedStyle(panel!).transform;
    const fromOpacity = getComputedStyle(backdrop!).opacity;
    const transform = opening ? 'translateX(0)' : 'translateX(-100%)';
    const opacity = opening ? '1' : '0';
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (!reducedMotion.matches) {
      animations = [
        panel!.animate([{ transform: fromTransform }, { transform }], timing),
        backdrop!.animate([{ opacity: fromOpacity }, { opacity }], timing),
      ];
      try { await Promise.all(animations.map(animation => animation.finished)); }
      catch { /* A newer transition or breakpoint change supersedes this one. */ }
    }
    if (run !== revision) return;
    panel!.style.transform = transform;
    backdrop!.style.opacity = opacity;
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (!opening) finishClose();
  }

  function requestClose() {
    if (dialog!.hidden || closing) return;
    closing = true;
    void slide(false);
  }

  trigger.hidden = false;
  trigger.addEventListener('click', () => {
    if (!dialog.hidden) return;
    previousOverflow = document.documentElement.style.overflow;
    syncMobileScene();
    // A document-positioned modal avoids iOS's clipped fixed/top-layer surfaces.
    // Preserve the native dialog behavior explicitly: inert background + focus trap.
    inertSiblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog &&
        !['SCRIPT', 'STYLE'].includes(element.tagName))
      .map(element => ({ element, wasInert: element.inert }));
    inertSiblings.forEach(({ element }) => { element.inert = true; });
    dialog.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    closeButton.focus({ preventScroll: true });
    void slide(true);
  });
  closeButton.addEventListener('click', requestClose);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
  dialog.querySelectorAll<HTMLAnchorElement>('a').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (closing) return;
    destination = link.href;
    requestClose();
  }));
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', event => { pressedOutside = event.target === dialog; });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && pressedOutside) requestClose();
  });
  dialog.addEventListener('touchmove', event => {
    const scroller = event.target instanceof Element ? event.target.closest('.mobile-menu-content') : null;
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) event.preventDefault();
  }, { passive: false });
  desktop.addEventListener('change', () => { if (desktop.matches && !dialog.hidden) finishClose(); });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) animations.forEach(animation => animation.finish());
  });
}
