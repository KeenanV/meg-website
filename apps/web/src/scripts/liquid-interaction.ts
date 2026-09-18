const bindings = new WeakMap<HTMLElement, () => void>();

export function unbindLiquidInteraction(element: HTMLElement) {
  bindings.get(element)?.();
  bindings.delete(element);
}

export function bindLiquidInteraction(element: HTMLElement, reducedMotion: MediaQueryList) {
  unbindLiquidInteraction(element);
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const doc = element.ownerDocument;
  const viewport = doc.defaultView!;
  let frame: number | undefined;
  let pressedPointer: number | undefined;
  let pointerType = '';

  function clear() {
    if (frame !== undefined) viewport.cancelAnimationFrame(frame);
    frame = undefined;
    pressedPointer = undefined;
    element.removeAttribute('data-liquid-active');
    // Retain the last coordinates while the highlight fades out.
  }

  function highlight(event: PointerEvent) {
    element.dataset.liquidActive = 'true';
    if (reducedMotion.matches) return;
    if (frame !== undefined) viewport.cancelAnimationFrame(frame);
    frame = viewport.requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--mx', ((event.clientX - rect.left) / rect.width) * 100 + '%');
      element.style.setProperty('--my', ((event.clientY - rect.top) / rect.height) * 100 + '%');
      frame = undefined;
    });
  }

  element.addEventListener('pointerenter', event => {
    pointerType = event.pointerType;
    if (event.pointerType !== 'touch') highlight(event);
  }, options);
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    pressedPointer = event.pointerId;
    pointerType = event.pointerType;
    highlight(event);
  }, options);
  element.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && event.pointerId !== pressedPointer) return;
    pointerType = event.pointerType;
    highlight(event);
  }, options);
  element.addEventListener('pointerleave', clear, options);
  element.addEventListener('lostpointercapture', clear, options);
  // Listen on the document: a finger can be released outside the original control.
  doc.addEventListener('pointerup', event => {
    if (event.pointerId !== pressedPointer) return;
    pressedPointer = undefined;
    if (pointerType !== 'mouse') clear();
  }, { ...options, capture: true, passive: true });
  doc.addEventListener('pointercancel', event => {
    if (event.pointerId === pressedPointer) clear();
  }, { ...options, capture: true, passive: true });
  doc.addEventListener('scroll', () => {
    if (pointerType === 'touch') clear();
  }, { ...options, capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); }, options);
  viewport.addEventListener('blur', clear, options);
  viewport.addEventListener('pagehide', clear, options);
  bindings.set(element, () => { controller.abort(); clear(); });
}
