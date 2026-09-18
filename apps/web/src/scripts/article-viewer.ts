import { restoreDialogFocus } from './input-method';
import { beginArticleDocumentScroll } from './article-document-scroll';
import { bindLiquidInteraction, unbindLiquidInteraction } from './liquid-interaction';
import { LruCache } from '../lib/lru-cache';

const dialog = document.querySelector<HTMLDialogElement>('.article-dialog');
const content = dialog?.querySelector<HTMLElement>('.article-dialog-content');
const backdrop = dialog?.querySelector<HTMLElement>('.article-dialog-backdrop');

if (dialog && content && backdrop && typeof dialog.showModal === 'function') {
  const viewer = dialog;
  const mount = content;
  const scrim = backdrop;
  const transitionTiming = { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)' };
  let results = document.querySelector<HTMLElement>('[data-article-results]')!;
  const kind = new URL(viewer.dataset.listingPath!, location.href).pathname.split('/')[1];
  const listingPattern = new RegExp(`^/${kind}(?:/page/[2-9][0-9]*|/page/1[0-9]+)?/?$`);
  let listingURL = new URL(viewer.dataset.listingPath!, location.href).href;
  const siteTitle = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;
  let listingTitle = viewer.dataset.listingTitle + (siteTitle ? ' | ' + siteTitle : '');
  let initialPane = mount.querySelector<HTMLElement>('.article-pane');
  const status = document.querySelector<HTMLElement>('[data-article-status]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const metadata = Array.from(document.querySelectorAll<HTMLMetaElement | HTMLLinkElement>(
    'meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[property="og:url"], link[rel="canonical"]',
  )).map(element => {
    const property = element.getAttribute('property');
    const isURL = element.tagName === 'LINK' || property === 'og:url';
    const original = isURL
      ? new URL(viewer.dataset.listingPath!, element.getAttribute(element.tagName === 'LINK' ? 'href' : 'content')!).href
      : property === 'og:title' ? listingTitle : viewer.dataset.listingDescription!;
    const attribute = element.tagName === 'LINK' ? 'href' : 'content';
    const selector = element.tagName === 'LINK' ? 'link[rel="canonical"]' :
      element.hasAttribute('name') ? `meta[name="${element.getAttribute('name')}"]` :
        `meta[property="${property}"]`;
    return { element, original, attribute, selector };
  });
  type PageMetadata = { title: string; values: string[] };
  type ArticleData = { html: string; metadata: PageMetadata };
  // Cache only five extracted articles, never their surrounding grids or documents.
  const cache = new LruCache<ArticleData>(5);
  let pendingRequest: AbortController | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let newPageNavigation = false;
  let restorePagePosition = false;
  const originalScrollRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  let source: HTMLAnchorElement | undefined;
  let pane: HTMLElement | undefined;
  let activeURL: string | undefined;
  let reconciling = false;
  let overflow = '';
  let flightAnimations: Animation[] = [];
  let backdropAnimation: Animation | undefined;
  let sourceVisibility = '';
  let closingRequested = false;
  let restoreListing: (() => void) | undefined;

  // Shared links may have a trailing slash, tracking parameters, or a fragment.
  function currentCard() {
    const path = location.pathname.replace(/\/$/, '');
    return Array.from(results.querySelectorAll<HTMLAnchorElement>('a[data-article-link]')).find(card => new URL(card.href).pathname.replace(/\/$/, '') === path);
  }

  function setListingHeading(expanded: boolean) {
    const heading = document.querySelector('[data-article-listing-heading] :is(h1, h2)');
    const tag = expanded ? 'h2' : 'h1';
    if (!heading || heading.tagName.toLowerCase() === tag) return;
    const replacement = document.createElement(tag);
    for (const attribute of heading.attributes) replacement.setAttribute(attribute.name, attribute.value);
    replacement.append(...heading.childNodes);
    heading.replaceWith(replacement);
  }

  function showArticle(card: HTMLAnchorElement, article: HTMLElement) {
    source = card;
    sourceVisibility = card.style.visibility;
    card.removeAttribute('data-liquid-active');
    source.style.visibility = 'hidden'; // Reserve the source's grid cell until it returns.
    pane = article;
    const heading = pane.querySelector('h1')!;
    heading.id = 'article-viewer-title';
    heading.tabIndex = -1;
    mount.replaceChildren(pane);
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    // Back must not move the grid after the return animation measures its destination.
    history.scrollRestoration = 'manual';
    // Promote the server-rendered open dialog to a modal without an opening animation.
    if (viewer.open) viewer.close();
    restoreListing = beginArticleDocumentScroll(viewer);
    if (!restoreListing) viewer.showModal();
    viewer.scrollTop = 0;
    activeURL = card.href;
    setListingHeading(true);
    return heading;
  }

  function readMetadata(page: Document): PageMetadata {
    return { title: page.title, values: metadata.map(({ selector, attribute, original }) =>
      page.querySelector(selector)?.getAttribute(attribute) || original) };
  }

  async function fetchPage(url: string) {
    const controller = new AbortController();
    pendingRequest = controller;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Page unavailable');
      return new DOMParser().parseFromString(await response.text(), 'text/html');
    } finally { if (pendingRequest === controller) pendingRequest = undefined; }
  }

  async function load(url: string): Promise<ArticleData> {
    const cached = cache.get(url);
    if (cached) return cached;
    const page = await fetchPage(url);
    const article = page.querySelector<HTMLElement>('.article-pane');
    if (!article?.querySelector('h1')) throw new Error('Invalid article page');
    const data = { html: article.outerHTML, metadata: readMetadata(page) };
    cache.set(url, data);
    return data;
  }

  function savePosition() {
    if (!activeURL && !reconciling && listingPattern.test(location.pathname)) {
      history.replaceState({ ...history.state, listingScroll: [scrollX, scrollY] }, '');
    }
  }

  function desiredListing() {
    return listingPattern.test(location.pathname)
      ? new URL(location.pathname.replace(/\/$/, '') + (location.pathname.includes('/page/') ? '/' : ''), location.href).href
      : history.state?.articleListing || listingURL;
  }

  async function fadeGrid(opacity: number) {
    results.style.opacity = String(opacity);
    if (motion.matches) return;
    const animation = results.animate([{ opacity: 1 - opacity }, { opacity }],
      { duration: opacity ? 220 : 130, easing: 'ease-out', fill: 'forwards' });
    try { await animation.finished; } catch { /* Navigation still completes. */ }
    animation.cancel();
  }

  async function scrollToListingTop(url: string) {
    if (!newPageNavigation || motion.matches) return;
    const start = scrollY;
    const began = performance.now();
    await new Promise<void>(resolve => {
      function step(now: number) {
        if (desiredListing() !== url) { resolve(); return; }
        const progress = Math.min(1, (now - began) / 300);
        window.scrollTo({ top: start * Math.pow(1 - progress, 3), behavior: 'instant' });
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function changeListing(url: string) {
    const page = await fetchPage(url);
    const next = page.querySelector<HTMLElement>('[data-article-results]');
    if (!next || new URL(next.dataset.listingPath!, url).href !== url) throw new Error('Invalid listing');
    if (desiredListing() !== url) return;
    results.setAttribute('aria-busy', 'true');
    await Promise.all([fadeGrid(0), scrollToListingTop(url)]);
    if (desiredListing() !== url) {
      results.style.opacity = '';
      results.removeAttribute('aria-busy');
      return;
    }
    // Explicitly detach document-level hover listeners before releasing the old grid.
    results.querySelectorAll<HTMLElement>('[data-liquid="true"]').forEach(unbindLiquidInteraction);
    const replacement = document.importNode(next, true);
    results.replaceWith(replacement);
    results = replacement;
    results.querySelectorAll<HTMLElement>('[data-liquid="true"]').forEach(element => bindLiquidInteraction(element, motion));
    listingURL = url;
    listingTitle = page.title;
    const pageMetadata = readMetadata(page);
    metadata.forEach((item, index) => { item.original = pageMetadata.values[index]; });
    updateMetadata();
    const position = history.state?.listingScroll;
    window.scrollTo({ left: position?.[0] || 0, top: position?.[1] || 0, behavior: 'instant' });
    window.dispatchEvent(new Event('article:restore-listing'));
    if (newPageNavigation) results.focus({ preventScroll: true });
    newPageNavigation = false;
    restorePagePosition = false;
    await fadeGrid(1);
    if (status) status.textContent = `Page ${results.dataset.page} of ${results.dataset.totalPages} loaded.`;
  }

  async function fadeBackdrop(reverse = false) {
    const opacity = reverse ? 0 : 1;
    scrim.style.opacity = String(opacity);
    if (motion.matches) return;
    backdropAnimation = scrim.animate([{ opacity: 1 - opacity }, { opacity }],
      { ...transitionTiming, fill: 'both' });
    try { await backdropAnimation.finished; } catch { /* Keep the final opacity after cancellation. */ }
    finally {
      backdropAnimation.cancel();
      backdropAnimation = undefined;
    }
  }

  function updateMetadata(page?: PageMetadata) {
    document.title = page?.title || listingTitle;
    metadata.forEach(({ element, original, attribute }, index) => {
      element.setAttribute(attribute, page?.values[index] || original);
    });
  }

  // Independently rotate the faces so their glass can sample the page behind them.
  // A shared preserve-3d ancestor prevents that blur from rendering consistently.
  async function fly(reverse = false) {
    if (!source || !pane) return;
    if (motion.matches) { await fadeBackdrop(reverse); return; }
    const origin = source.getBoundingClientRect();
    const destination = pane.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(viewer).paddingTop);
    const top = Math.max(gutter, destination.top);
    // Clip long articles below the viewport, avoiding a temporary rounded bottom edge on screen.
    const height = Math.min(destination.bottom - top, innerHeight - top + gutter);
    const surfaces = [source, pane].map(element => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backdropFilter: style.backdropFilter };
    });
    const shell = document.createElement('div');
    shell.className = 'article-flight';
    shell.setAttribute('aria-hidden', 'true');
    shell.inert = true;
    const front = document.createElement('div');
    front.className = 'article-flight-face article-flight-front';
    const cardPreview = source.cloneNode(true) as HTMLElement;
    cardPreview.style.visibility = sourceVisibility;
    front.append(cardPreview);
    const back = document.createElement('div');
    back.className = 'article-flight-face article-flight-back';
    const preview = pane.cloneNode(true) as HTMLElement;
    preview.style.visibility = '';
    // When dismissing a scrolled article, preserve the visible slice during the return flight.
    preview.style.transform = `translateY(${Math.min(0, destination.top - top)}px)`;
    back.append(preview);
    shell.append(front, back);
    shell.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    viewer.append(shell);
    pane.style.visibility = 'hidden';
    const frame = (left: number, y: number, width: number, h: number, transform: string) =>
      ({ left: `${left}px`, top: `${y}px`, width: `${width}px`, height: `${h}px`, transform });
    flightAnimations = [front, back].map((face, index) => {
      const angle = index * 180;
      const keyframes: Keyframe[] = [
        { ...frame(origin.left, origin.top, origin.width, origin.height,
          `perspective(1600px) translateZ(0) rotateY(${angle}deg)`), ...surfaces[0] },
        { ...frame((origin.left + destination.left) / 2, (origin.top + top) / 2,
          (origin.width + destination.width) / 2, (origin.height + height) / 2,
          `perspective(1600px) translateZ(180px) rotateY(${angle - 90}deg)`), offset: .5 },
        { ...frame(destination.left, top, destination.width, height,
          `perspective(1600px) translateZ(0) rotateY(${angle - 180}deg)`), ...surfaces[1] },
      ];
      // Reverse the path, not the playback clock: both directions should ease out.
      return face.animate(reverse ? keyframes.reverse() : keyframes,
        { ...transitionTiming, fill: 'both' });
    });
    try { await Promise.all([fadeBackdrop(reverse), ...flightAnimations.map(animation => animation.finished)]); }
    catch { /* Cancellation still restores the real content. */ }
    finally {
      // Reveal only the destination, in the same frame that removes the moving faces.
      if (reverse) source.style.visibility = sourceVisibility;
      else pane.style.visibility = '';
      shell.remove();
      flightAnimations.forEach(animation => animation.cancel());
      flightAnimations = [];
    }
  }

  async function close() {
    // Freeze gestures during the return flight, then restore the listing's scroll.
    document.documentElement.style.overflow = 'hidden';
    await fly(true);
    viewer.close();
    if (source) source.style.visibility = sourceVisibility;
    mount.replaceChildren();
    restoreListing?.();
    restoreListing = undefined;
    // The return flight has already restored this grid, including direct-entry
    // centering. Do not jump to an older saved offset after the card lands.
    if (desiredListing() === listingURL && !currentCard()) restorePagePosition = false;
    document.documentElement.style.overflow = overflow;
    updateMetadata();
    setListingHeading(false);
    restoreDialogFocus(source);
    pane = undefined;
    source = undefined;
    activeURL = undefined;
    closingRequested = false;
  }

  // Serialize transitions and re-read the URL after each await. Back/Forward during a load or flip wins.
  async function reconcile() {
    if (reconciling) return;
    reconciling = true;
    try {
      while (true) {
        const targetListing = desiredListing();
        const card = currentCard();
        if (activeURL && (activeURL !== card?.href || targetListing !== listingURL)) { await close(); continue; }
        if (targetListing !== listingURL) {
          if (status) status.textContent = 'Loading page…';
          try { await changeListing(targetListing); }
          catch {
            if (desiredListing() === targetListing) { location.assign(location.href); break; }
          }
          continue;
        }
        if (!card) {
          // Rapid Back/Forward may return to the grid already on screen before
          // its replacement finished loading. Still honor that history entry.
          if (restorePagePosition) {
            const position = history.state?.listingScroll;
            if (position) window.scrollTo({ left: position[0], top: position[1], behavior: 'instant' });
            if (newPageNavigation) results.focus({ preventScroll: true });
            restorePagePosition = false;
            newPageNavigation = false;
          }
          if (status?.textContent === 'Loading page…') status.textContent = '';
          break;
        }
        if (activeURL === card.href) break;
        card.setAttribute('aria-busy', 'true');
        if (status) status.textContent = 'Opening article…';
        let page: ArticleData;
        try { page = await load(card.href); }
        catch {
          if (currentCard() === card) { location.assign(card.href); break; }
          continue;
        } finally {
          card.removeAttribute('aria-busy');
          if (status) status.textContent = '';
        }
        if (currentCard() !== card) continue;
        const template = document.createElement('template');
        template.innerHTML = page.html;
        const heading = showArticle(card, template.content.firstElementChild as HTMLElement);
        updateMetadata(page.metadata);
        await fly();
        if (restoreListing) document.documentElement.style.overflow = overflow;
        heading.focus({ preventScroll: true });
      }
    } finally { reconciling = false; }
  }

  function requestClose() {
    if (closingRequested || currentCard()?.href !== activeURL) return;
    closingRequested = true;
    if (history.state?.articleListing === listingURL) history.back();
    else {
      history.replaceState(null, '', listingURL);
      void reconcile();
    }
  }
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[data-article-link], a[data-listing-link]') : null;
    if (!link || !results.contains(link)) return;
    event.preventDefault();
    if (activeURL) return;
    savePosition();
    if (link.hasAttribute('data-listing-link')) {
      if (new URL(link.href).href === location.href) return;
      newPageNavigation = true;
      restorePagePosition = true;
      history.pushState({ listingScroll: [0, 0] }, '', link.href);
    } else {
      if (reconciling) return;
      history.pushState({ articleListing: listingURL, listingScroll: [scrollX, scrollY] }, '', link.href);
    }
    pendingRequest?.abort();
    void reconcile();
  });
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(savePosition, 200);
  }, { passive: true });
  viewer.addEventListener('cancel', event => {
    event.preventDefault();
    // An automatically opened dialog can receive a non-cancelable native close request.
    // Keep it painted until our return animation finishes, then honor the dismissal.
    if (!event.cancelable) {
      const scrollTop = viewer.scrollTop;
      queueMicrotask(() => {
        if (activeURL && !viewer.open) {
          if (restoreListing) viewer.show();
          else viewer.showModal();
          viewer.scrollTop = scrollTop;
        }
      });
    }
    requestClose();
  });
  let pressedOutside = false;
  viewer.addEventListener('pointerdown', event => { pressedOutside = event.target === viewer; });
  viewer.addEventListener('click', event => {
    if (event.target === viewer && pressedOutside) requestClose();
    const target = event.target instanceof Element ? event.target.closest('a[data-article-close]') : null;
    if (target && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      requestClose();
    }
  });
  viewer.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(mount.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === pane?.querySelector('h1'))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
  window.addEventListener('popstate', () => {
    newPageNavigation = false;
    restorePagePosition = true;
    pendingRequest?.abort();
    void reconcile();
  });
  function finishTransition() {
    flightAnimations.forEach(animation => animation.finish());
    backdropAnimation?.finish();
  }
  motion.addEventListener('change', () => { if (motion.matches) finishTransition(); });
  let viewportWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    // Locking scroll on dismissal can expand mobile browser controls. Their
    // height-only resize must not finish the return flight after its first frame.
    // Still settle geometry-changing rotations/resizes and desktop resizing.
    if (!restoreListing || width !== viewportWidth) finishTransition();
    viewportWidth = width;
  });
  window.addEventListener('pagehide', () => { savePosition(); history.scrollRestoration = originalScrollRestoration; });
  window.addEventListener('pageshow', () => {
    history.scrollRestoration = 'manual';
  });

  if (initialPane) {
    const card = currentCard();
    if (card) {
      // Keep the pre-rendered article available for Forward/reopening without another fetch.
      cache.set(card.href, { html: initialPane.outerHTML, metadata: readMetadata(document) });
      const articleURL = location.href;
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (history.state?.articleListing !== listingURL) {
        // Give direct arrivals the same Back/Forward behavior as a click from the grid.
        history.replaceState({ listingScroll: [scrollX, scrollY] }, '', listingURL);
        history.pushState({ articleListing: listingURL, listingScroll: [scrollX, scrollY] }, '', articleURL);
      }
      const heading = showArticle(card, initialPane);
      scrim.style.opacity = '1';
      viewer.removeAttribute('data-initial-article');
      if (restoreListing) document.documentElement.style.overflow = overflow;
      heading.focus({ preventScroll: true });
    }
    initialPane = null;
  }
}
