const mobile = window.matchMedia('(max-width: 767px), (any-pointer: coarse)');
const touchScreen = window.matchMedia('(any-pointer: coarse)');
const root = document.documentElement;
let measuredWidth = 0;
let sceneHeight = 0;
let imageHeight = 0;
let frame: number | undefined;

export function syncMobileScene() {
  if (!mobile.matches) return;
  // Scroll locking can change clientWidth when a scrollbar disappears.
  const width = window.innerWidth;
  const visual = window.visualViewport;
  const visibleHeight = visual?.height || window.innerHeight;
  if (width !== measuredWidth || !sceneHeight) {
    // iOS can exclude the translucent toolbar area even from lvh. Use a stable
    // screen-sized canvas on touch devices, recalculating only on width changes
    // (rotation/resizing), never when browser bars or the keyboard change height.
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const screenHeight = touchScreen.matches
      ? (portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)) : 0;
    sceneHeight = Math.max(window.innerHeight, visibleHeight, screenHeight);
    const aspect = Number(root.dataset.sceneAspect) || 1;
    imageHeight = Math.max(sceneHeight, width / aspect);
    root.style.setProperty('--scene-height', `${sceneHeight}px`);
    root.style.setProperty('--scene-image-height', `${imageHeight}px`);
    root.style.setProperty('--scene-image-width', `${imageHeight * aspect}px`);
    measuredWidth = width;
  }
  const scroll = Math.max(0, window.scrollY);
  // The background follows scrolling in CSS. Only the drawer needs a document
  // offset, sampled when it opens (and when the viewport changes).
  root.style.setProperty('--page-scroll-y', `${scroll}px`);
  root.style.setProperty('--visible-height', `${visibleHeight}px`);
}

function schedule() {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => { frame = undefined; syncMobileScene(); });
}

window.addEventListener('resize', schedule);
window.addEventListener('pageshow', schedule);
window.visualViewport?.addEventListener('resize', schedule);
mobile.addEventListener('change', () => { measuredWidth = 0; schedule(); });
touchScreen.addEventListener('change', () => { measuredWidth = 0; schedule(); });
syncMobileScene();
