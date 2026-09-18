export function bindLiquidInteraction(element: HTMLElement, reducedMotion: MediaQueryList) {
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
  });
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    pressedPointer = event.pointerId;
    pointerType = event.pointerType;
    highlight(event);
  });
  element.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && event.pointerId !== pressedPointer) return;
    pointerType = event.pointerType;
    highlight(event);
  });
  element.addEventListener('pointerleave', clear);
  element.addEventListener('lostpointercapture', clear);
  // Listen on the document: a finger can be released outside the original control.
  doc.addEventListener('pointerup', event => {
    if (event.pointerId !== pressedPointer) return;
    pressedPointer = undefined;
    if (pointerType !== 'mouse') clear();
  }, { capture: true, passive: true });
  doc.addEventListener('pointercancel', event => {
    if (event.pointerId === pressedPointer) clear();
  }, { capture: true, passive: true });
  doc.addEventListener('scroll', () => {
    if (pointerType === 'touch') clear();
  }, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) clear(); });
  viewport.addEventListener('blur', clear);
  viewport.addEventListener('pagehide', clear);
}
