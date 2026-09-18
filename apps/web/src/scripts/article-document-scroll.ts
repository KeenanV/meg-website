/** Let mobile browsers observe document scrolling while the grid stays in place. */
export function beginArticleDocumentScroll(viewer: HTMLDialogElement): (() => void) | undefined {
  if (!matchMedia('(max-width: 767px), (any-pointer: coarse)').matches) return;
  const root = document.documentElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const main = document.querySelector<HTMLElement>('#main-content');
  if (!main) return;

  // Move the reader outside the frozen/inert listing. Capture all rectangles
  // before changing layout, including the sticky logo and mobile navigation.
  document.body.append(viewer);
  const frozen = [main, document.querySelector<HTMLElement>('body > header'),
    main.querySelector<HTMLElement>('.blog-intro')]
    .filter((element): element is HTMLElement => Boolean(element))
    .map(element => ({ element, rect: element.getBoundingClientRect(), style: element.getAttribute('style') }));
  const siblings = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== viewer &&
      !['SCRIPT', 'STYLE'].includes(element.tagName))
    .map(element => ({ element, inert: element.inert }));
  const logo = frozen.find(({ element }) => element.classList.contains('blog-intro'));
  const spacer = document.createElement('div');
  if (logo) {
    // Fixing the sticky title must not remove its normal-flow grid spacing.
    spacer.style.height = `${logo.rect.height}px`;
    spacer.setAttribute('aria-hidden', 'true');
    logo.element.before(spacer);
  }

  root.setAttribute('data-article-document-scroll', '');
  siblings.forEach(({ element }) => { element.inert = true; });
  frozen.forEach(({ element, rect }) => {
    Object.assign(element.style, {
      position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`,
      width: `${rect.width}px`, margin: '0',
    });
  });
  viewer.setAttribute('data-document-scroll', '');
  viewer.setAttribute('aria-modal', 'true');
  viewer.show();
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  return () => {
    viewer.removeAttribute('data-document-scroll');
    viewer.removeAttribute('aria-modal');
    frozen.forEach(({ element, style }) => {
      if (style === null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    });
    siblings.forEach(({ element, inert }) => { element.inert = inert; });
    spacer.remove();
    root.removeAttribute('data-article-document-scroll');
    window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' });
    window.dispatchEvent(new Event('article:restore-listing'));
  };
}
