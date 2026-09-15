const dialog = document.querySelector<HTMLDialogElement>('.article-dialog');
const content = dialog?.querySelector<HTMLElement>('.article-dialog-content');

if (dialog && content && typeof dialog.showModal === 'function') {
  const viewer = dialog;
  const mount = content;
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
  let flightAnimation: Animation | undefined;
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

  // The two faces share a moving frame: the card faces forward initially, the article after a half turn.
  async function fly(reverse = false) {
    if (!source || !pane || motion.matches) return;
    const origin = source.getBoundingClientRect();
    const destination = pane.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(viewer).paddingTop);
    const top = Math.max(gutter, destination.top);
    const height = Math.min(destination.bottom - top, innerHeight - top - gutter);
    const shell = document.createElement('div');
    shell.className = 'article-flight';
    shell.setAttribute('aria-hidden', 'true');
    shell.inert = true;
    const front = document.createElement('div');
    front.className = 'article-flight-face article-flight-front';
    front.append(source.cloneNode(true));
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
    source.style.visibility = 'hidden';
    pane.style.visibility = 'hidden';
    const frame = (left: number, y: number, width: number, h: number, transform: string) =>
      ({ left: `${left}px`, top: `${y}px`, width: `${width}px`, height: `${h}px`, transform });
    flightAnimation = shell.animate([
      frame(origin.left, origin.top, origin.width, origin.height, 'perspective(1600px) translateZ(0) rotateY(0deg)'),
      { ...frame((origin.left + destination.left) / 2, (origin.top + top) / 2,
        (origin.width + destination.width) / 2, (origin.height + height) / 2,
        'perspective(1600px) translateZ(180px) rotateY(-90deg)'), offset: .5 },
      frame(destination.left, top, destination.width, height, 'perspective(1600px) translateZ(0) rotateY(-180deg)'),
    ], { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both', direction: reverse ? 'reverse' : 'normal' });
    try { await flightAnimation.finished; } catch { /* Cancellation still restores the real content. */ }
    finally {
      shell.remove();
      pane.style.visibility = '';
      source.style.visibility = '';
      flightAnimation = undefined;
    }
  }

  async function close() {
    await fly(true);
    viewer.close();
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
  motion.addEventListener('change', () => { if (motion.matches) flightAnimation?.finish(); });
  window.addEventListener('resize', () => flightAnimation?.finish());
}
