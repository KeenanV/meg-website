const listing = document.querySelector<HTMLElement>('.blog-listing');
const header = listing?.querySelector<HTMLElement>('.blog-intro');
const logo = listing?.querySelector<HTMLImageElement>('.blog-logo');

if (listing && header && logo) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let start = 0;
  let distance = 1;
  let frame: number | undefined;

  function render() {
    frame = undefined;
    if (document.documentElement.hasAttribute('data-article-document-scroll')) return;
    const collapse = reducedMotion.matches ? 0 : Math.min(distance, Math.max(0, window.scrollY - start));
    // The initials fit inside a vertical capsule in the 4600x4000 artwork:
    // radius 800, centered at x=855.6, with endpoints at y=800 and y=3200.
    // Its rotated height is 1600 + 2400*cos(angle). Invert that geometry so
    // the panel shrinks exactly one pixel per pixel scrolled, without scaling SOS.
    const angle = Math.acos(1 - collapse / distance);
    listing!.style.setProperty('--logo-progress', String(angle / (Math.PI / 2)));
    listing!.style.setProperty('--logo-collapse', `${collapse}px`);
  }

  function measure() {
    if (document.documentElement.hasAttribute('data-article-document-scroll')) return;
    // Measure the normal-flow wrapper, not the sticky or shrinking header.
    const top = listing!.getBoundingClientRect().top + window.scrollY;
    start = Math.max(0, top - parseFloat(getComputedStyle(header!).top));
    // SOS at 90 degrees needs 40% of the original height; the remaining 60%
    // is the scroll distance available for collapsing the panel.
    distance = Math.max(1, parseFloat(getComputedStyle(logo!).height) * 0.6);
    render();
  }

  window.addEventListener('scroll', () => {
    if (frame === undefined) frame = requestAnimationFrame(render);
  }, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('pageshow', measure);
  window.addEventListener('article:restore-listing', measure);
  reducedMotion.addEventListener('change', measure);
  measure();
}
