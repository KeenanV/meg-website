const dialog = document.querySelector<HTMLDialogElement>('.article-dialog');
const content = dialog?.querySelector<HTMLElement>('.article-dialog-content');
const backdrop = dialog?.querySelector<HTMLElement>('.article-dialog-backdrop');

if (dialog && content && backdrop && typeof dialog.showModal === 'function') {
  const viewer = dialog;
  const mount = content;
  const scrim = backdrop;
  const transitionTiming = { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)' };
  const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-article-link]'));
  const listingURL = location.href;
  const listingTitle = document.title;
  const status = document.querySelector<HTMLElement>('[data-article-status]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const metadata = Array.from(document.querySelectorAll<HTMLMetaElement | HTMLLinkElement>(
    'meta[name="description"], meta[property="og:title"], meta[property="og:description"], link[rel="canonical"]',
  )).map(element => ({ element, original: element.getAttribute(element.tagName === 'LINK' ? 'href' : 'content')! }));
  const cache = new Map<string, Promise<Document>>();
  let source: HTMLAnchorElement | undefined;
  let pane: HTMLElement | undefined;
  let activeURL: string | undefined;
  let reconciling = false;
  let overflow = '';
  let flightAnimations: Animation[] = [];
  let backdropAnimation: Animation | undefined;
  let sourceVisibility = '';
  let closingRequested = false;

  function load(url: string) {
    let request = cache.get(url);
    if (!request) {
      request = fetch(url).then(async response => {
        if (!response.ok) throw new Error('Article unavailable');
        const page = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (!page.querySelector('.article-pane h1')) throw new Error('Invalid article page');
        return page;
      }).catch(error => { cache.delete(url); throw error; });
      cache.set(url, request);
    }
    return request;
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

  function updateMetadata(page?: Document) {
    document.title = page?.title || listingTitle;
    for (const { element, original } of metadata) {
      const attribute = element.tagName === 'LINK' ? 'href' : 'content';
      const selector = element.tagName === 'LINK' ? 'link[rel="canonical"]' :
        element.hasAttribute('name') ? `meta[name="${element.getAttribute('name')}"]` :
          `meta[property="${element.getAttribute('property')}"]`;
      element.setAttribute(attribute, page?.querySelector(selector)?.getAttribute(attribute) || original);
    }
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
    await fly(true);
    viewer.close();
    if (source) source.style.visibility = sourceVisibility;
    mount.replaceChildren();
    document.documentElement.style.overflow = overflow;
    updateMetadata();
    source?.focus({ preventScroll: true });
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
        const card = cards.find(card => card.href === location.href);
        if (activeURL === card?.href) break;
        if (activeURL) { await close(); continue; }
        if (!card) break;
        card.setAttribute('aria-busy', 'true');
        if (status) status.textContent = 'Opening article…';
        let page: Document;
        try { page = await load(card.href); }
        catch {
          if (location.href === card.href) location.assign(card.href);
          break;
        } finally {
          card.removeAttribute('aria-busy');
          if (status) status.textContent = '';
        }
        if (location.href !== card.href) continue;
        source = card;
        sourceVisibility = card.style.visibility;
        // Visibility preserves the grid cell while the card lives in the viewer.
        source.style.visibility = 'hidden';
        pane = document.importNode(page.querySelector<HTMLElement>('.article-pane')!, true);
        const heading = pane.querySelector('h1')!;
        heading.id = 'article-viewer-title';
        heading.tabIndex = -1;
        mount.replaceChildren(pane);
        overflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        viewer.showModal();
        viewer.scrollTop = 0;
        updateMetadata(page);
        activeURL = card.href;
        await fly();
        heading.focus({ preventScroll: true });
      }
    } finally { reconciling = false; }
  }

  function requestClose() {
    if (closingRequested || location.href !== activeURL) return;
    closingRequested = true;
    if (history.state?.articleListing === listingURL) history.back();
    else location.assign(listingURL);
  }
  cards.forEach(card => {
    // Warm the static article document without blocking ordinary link navigation.
    const prefetch = () => { void load(card.href).catch(() => {}); };
    card.addEventListener('pointerenter', prefetch, { once: true });
    card.addEventListener('focus', prefetch, { once: true });
    card.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (reconciling) return;
      history.pushState({ articleListing: listingURL }, '', card.href);
      void reconcile();
    });
  });
  viewer.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
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
  window.addEventListener('popstate', () => { void reconcile(); });
  function finishTransition() {
    flightAnimations.forEach(animation => animation.finish());
    backdropAnimation?.finish();
  }
  motion.addEventListener('change', () => { if (motion.matches) finishTransition(); });
  window.addEventListener('resize', finishTransition);
}
