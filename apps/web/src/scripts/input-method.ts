let keyboardInput = true;

document.addEventListener('pointerdown', () => {
  keyboardInput = false;
  document.documentElement.dataset.inputMethod = 'pointer';
}, { capture: true, passive: true });

document.addEventListener('keydown', event => {
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
  keyboardInput = true;
  document.documentElement.dataset.inputMethod = 'keyboard';
}, { capture: true });

export function restoreDialogFocus(target?: HTMLElement) {
  if (keyboardInput) {
    target?.focus({ preventScroll: true });
  } else if (document.activeElement instanceof HTMLElement) {
    // Native dialog.close() can also restore focus. Clear it for a pointer
    // dismissal so the returned link/button does not remain selected.
    document.activeElement.blur();
  }
}
