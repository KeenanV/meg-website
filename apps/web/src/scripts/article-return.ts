// A directly loaded article has no source card in the DOM, but still supports dismissing the pane.
const article = document.querySelector<HTMLElement>('main [data-article-kind]');
const pane = article?.closest<HTMLElement>('.article-pane');
const main = document.querySelector('main');
const back = article?.querySelector<HTMLAnchorElement>('[data-article-close]');
if (pane && main && back) {
  let leaving = false;
  let animation: Animation | undefined;
  const leave = async () => {
    if (leaving) return;
    leaving = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = pane.animate([
        { transform: 'perspective(1600px) rotateY(0) scale(1)', opacity: 1 },
        { transform: 'perspective(1600px) rotateY(90deg) scale(.8)', opacity: .5 },
        { transform: 'perspective(1600px) rotateY(180deg) scale(.6)', opacity: 0 },
      ], { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'forwards' });
      await animation.finished.catch(() => {});
    }
    location.assign(back.href);
  };
  let pressedOutside = false;
  main.addEventListener('pointerdown', event => { pressedOutside = !pane.contains(event.target as Node); });
  main.addEventListener('click', event => {
    if (pressedOutside && !pane.contains(event.target as Node)) void leave();
  });
  back.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void leave();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) void leave();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { animation?.cancel(); leaving = false; }
  });
}
