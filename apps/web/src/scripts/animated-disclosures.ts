const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll<HTMLDetailsElement>('[data-animated-disclosure]').forEach(details => {
  const summary = details.querySelector('summary');
  const panel = details.querySelector<HTMLElement>('.reading-copy');
  if (!summary || !panel || !details.animate) return;

  let expanded = details.open;
  let animation: Animation | undefined;
  const finish = () => {
    details.open = expanded;
    animation?.cancel();
    animation = undefined;
    details.style.removeProperty('overflow');
  };

  summary.addEventListener('click', event => {
    event.preventDefault();
    // Capture the current frame before cancelling, so rapid clicks reverse smoothly.
    const startHeight = details.getBoundingClientRect().height;
    animation?.cancel();
    expanded = !expanded;
    summary.setAttribute('aria-expanded', String(expanded));
    details.dataset.expanded = String(expanded);
    panel.inert = !expanded;
    if (reducedMotion.matches) {
      finish();
      return;
    }

    // Measure both native states, then keep the content rendered until closing finishes.
    details.open = expanded;
    const endHeight = details.getBoundingClientRect().height;
    details.open = true;
    details.style.overflow = 'hidden';
    animation = details.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 300, easing: 'ease-in-out', fill: 'both' },
    );
    animation.onfinish = finish;
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && animation) finish();
  });
});
