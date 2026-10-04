import {clampAudioTime, formatAudioTime} from '../lib/audio';

const library = document.querySelector<HTMLElement>('[data-meditation-library]');
if (library) setupPlayer(library);

function setupPlayer(root: HTMLElement) {
  const audio = root.querySelector<HTMLAudioElement>('[data-meditation-audio]')!;
  const player = root.querySelector<HTMLElement>('[data-meditation-player]')!;
  const cards = [...root.querySelectorAll<HTMLButtonElement>('[data-meditation-card]')];
  const toggle = root.querySelector<HTMLButtonElement>('[data-player-toggle]')!;
  const close = root.querySelector<HTMLButtonElement>('[data-player-close]')!;
  const seek = root.querySelector<HTMLInputElement>('[data-player-seek]')!;
  const title = root.querySelector<HTMLElement>('[data-player-title]')!;
  const artwork = root.querySelector<HTMLImageElement>('[data-player-artwork]')!;
  const elapsed = root.querySelector<HTMLElement>('[data-player-elapsed]')!;
  const durationLabel = root.querySelector<HTMLElement>('[data-player-duration]')!;
  const status = root.querySelector<HTMLElement>('[data-player-status]')!;
  const playIcon = root.querySelector<HTMLElement>('[data-play-icon]')!;
  const pauseIcon = root.querySelector<HTMLElement>('[data-pause-icon]')!;
  let active: HTMLButtonElement | undefined;
  let request = 0;
  let scrubbing = false;
  let starting = false;

  function duration() { return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0; }
  function announce(message: string) { status.textContent = message; }
  function playbackState() {
    const playing = !audio.paused && !audio.ended;
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${active?.dataset.title || 'meditation'}`);
    if (active) {
      active.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${active.dataset.title}`);
      active.querySelector<HTMLElement>('[data-card-status]')!.textContent = audio.ended ? 'Practice complete · Play again' : playing ? 'Now playing · Tap to pause' : 'Paused · Tap to play';
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = active ? playing ? 'playing' : 'paused' : 'none';
  }
  function updateTime() {
    const length = duration();
    const time = clampAudioTime(audio.currentTime, length);
    seek.disabled = !length;
    seek.max = String(length);
    durationLabel.textContent = formatAudioTime(length);
    if (!scrubbing) {
      seek.value = String(time);
      elapsed.textContent = formatAudioTime(time);
      seek.style.setProperty('--played', `${length ? time / length * 100 : 0}%`);
      seek.setAttribute('aria-valuetext', `${formatAudioTime(time)} of ${formatAudioTime(length)}`);
    }
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && length) {
      try { navigator.mediaSession.setPositionState({duration: length, position: time, playbackRate: audio.playbackRate}); }
      catch { /* Older browser implementations may expose but not support this API. */ }
    }
  }
  function pause() {
    request++;
    starting = false;
    audio.pause();
    announce('');
    playbackState();
  }
  function play() {
    if (!active) return;
    const current = ++request;
    starting = true;
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    announce('Loading meditation…');
    // Start within the click itself, before any flip animation or awaited work.
    void audio.play().catch(error => {
      if (current !== request) return;
      starting = false;
      announce(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Press play to start listening.' : 'This meditation could not play. Please try again.');
      playbackState();
    });
  }
  function flip(card: HTMLButtonElement, selected: boolean) {
    card.toggleAttribute('data-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    if (selected) card.setAttribute('aria-describedby', card.dataset.descriptionId!);
    else card.removeAttribute('aria-describedby');
    card.querySelector('.meditation-front')!.setAttribute('aria-hidden', String(selected));
    card.querySelector('.meditation-back')!.setAttribute('aria-hidden', String(!selected));
    if (!selected) card.setAttribute('aria-label', `Play ${card.dataset.title}`);
  }
  function seekTo(time: number) {
    if (!duration()) return;
    audio.currentTime = clampAudioTime(time, duration());
    updateTime();
  }
  function mediaControls(enabled: boolean) {
    if (!('mediaSession' in navigator)) return;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play, pause, stop: () => stop(false),
      seekto: event => { if (event.seekTime !== undefined) seekTo(event.seekTime); },
      seekbackward: event => seekTo(audio.currentTime - (event.seekOffset ?? 15)),
      seekforward: event => seekTo(audio.currentTime + (event.seekOffset ?? 15)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, enabled ? handler! : null); }
      catch { /* Not all devices support every media action. */ }
    }
  }
  function select(card: HTMLButtonElement) {
    if (active === card) {
      if (starting || !audio.paused) pause(); else play();
      return;
    }
    request++;
    audio.pause();
    if (active) flip(active, false);
    active = card;
    scrubbing = false;
    flip(card, true);
    title.textContent = card.dataset.title!;
    artwork.hidden = !card.dataset.artwork;
    if (card.dataset.artwork) artwork.src = card.dataset.artwork;
    else artwork.removeAttribute('src');
    player.hidden = false;
    root.dataset.playerOpen = 'true';
    audio.src = card.dataset.audioUrl!;
    audio.load();
    updateTime();
    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: card.dataset.title, artist: 'Meg Van Deusen', album: 'Guided meditations',
        artwork: card.dataset.artwork ? [{src: card.dataset.artwork}] : [],
      });
    }
    mediaControls(true);
    playbackState();
    play();
  }
  function stop(restoreFocus: boolean) {
    const previous = active;
    pause();
    if (previous) flip(previous, false);
    active = undefined;
    audio.removeAttribute('src');
    audio.load();
    player.hidden = true;
    delete root.dataset.playerOpen;
    mediaControls(false);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
    if (restoreFocus) previous?.focus({preventScroll: true});
  }
  cards.forEach(card => { card.disabled = false; card.addEventListener('click', () => select(card)); });
  toggle.addEventListener('click', () => { if (starting || !audio.paused) pause(); else play(); });
  close.addEventListener('click', () => stop(true));
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  seek.addEventListener('keydown', () => { scrubbing = true; });
  const finishScrub = () => { scrubbing = false; updateTime(); };
  document.addEventListener('pointerup', finishScrub);
  document.addEventListener('pointercancel', finishScrub);
  seek.addEventListener('keyup', finishScrub);
  seek.addEventListener('blur', finishScrub);
  seek.addEventListener('input', () => {
    const time = clampAudioTime(Number(seek.value), duration());
    seekTo(time);
    elapsed.textContent = formatAudioTime(time);
    seek.style.setProperty('--played', `${duration() ? time / duration() * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', `${formatAudioTime(time)} of ${formatAudioTime(duration())}`);
  });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) audio.addEventListener(event, updateTime);
  for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, playbackState);
  audio.addEventListener('playing', () => { starting = false; announce(''); });
  audio.addEventListener('ended', () => { starting = false; announce('Practice complete. Take a moment before continuing.'); });
  audio.addEventListener('waiting', () => { if (!audio.paused) announce('Buffering…'); });
  audio.addEventListener('canplay', () => { if (!audio.paused) announce(''); });
  audio.addEventListener('error', () => { if (active) { starting = false; announce('This meditation could not load. Please try again.'); playbackState(); } });
  artwork.addEventListener('error', () => { artwork.hidden = true; });
  new ResizeObserver(() => {
    if (!player.hidden) root.style.setProperty('--player-height', `${player.getBoundingClientRect().height}px`);
  }).observe(player);
  window.addEventListener('pagehide', () => stop(false));
}
