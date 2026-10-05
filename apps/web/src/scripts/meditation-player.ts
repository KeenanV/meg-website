import {clampAudioTime, formatAudioTime} from '../lib/audio';

export function setupPlayer(root: HTMLElement) {
  const listeners = new AbortController();
  const options = {signal: listeners.signal};
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
  let animationFrame = 0;
  let resumeTime: number | undefined;
  let automaticRetries = 0;
  let wantsPlayback = false;

  function duration() { return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0; }
  function announce(message: string) { status.textContent = message; }
  function playbackState() {
    const playing = !audio.paused && !audio.ended;
    playIcon.toggleAttribute('hidden', playing);
    pauseIcon.toggleAttribute('hidden', !playing);
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${active?.dataset.title || 'recording'}`);
    if (active) {
      active.querySelectorAll('[data-card-play-icon]').forEach(icon => icon.toggleAttribute('hidden', playing));
      active.querySelectorAll('[data-card-pause-icon]').forEach(icon => icon.toggleAttribute('hidden', !playing));
      active.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${active.dataset.title}`);
      active.querySelector<HTMLElement>('[data-card-status]')!.textContent = audio.ended ? 'Practice complete · Play again' : playing ? 'Now playing · Tap to pause' : 'Paused · Tap to play';
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = active ? playing ? 'playing' : 'paused' : 'none';
  }
  function drawProgress() {
    if (scrubbing) return;
    const length = duration();
    const time = clampAudioTime(audio.currentTime, length);
    seek.value = String(time);
    seek.style.setProperty('--played', `${length ? time / length * 100 : 0}%`);
    const label = formatAudioTime(time);
    if (elapsed.textContent !== label) elapsed.textContent = label;
    const description = `${label} of ${formatAudioTime(length)}`;
    if (seek.getAttribute('aria-valuetext') !== description) seek.setAttribute('aria-valuetext', description);
  }
  function stopProgress() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  function startProgress() {
    stopProgress();
    if (audio.paused || audio.ended || document.hidden) return;
    const frame = () => {
      drawProgress();
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
  }
  function updateTime() {
    const length = duration();
    const time = clampAudioTime(audio.currentTime, length);
    seek.disabled = !length;
    seek.max = String(length);
    durationLabel.textContent = formatAudioTime(length);
    drawProgress();
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && length) {
      try { navigator.mediaSession.setPositionState({duration: length, position: time, playbackRate: audio.playbackRate}); }
      catch { /* Older browser implementations may expose but not support this API. */ }
    }
  }
  function pause() {
    wantsPlayback = false;
    request++;
    starting = false;
    audio.pause();
    stopProgress();
    announce('');
    playbackState();
  }
  function play() {
    if (!active) return;
    const current = ++request;
    starting = true;
    wantsPlayback = true;
    if (audio.error) renewSource();
    if (audio.ended) audio.currentTime = 0;
    announce(audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 'Loading recording…' : '');
    // Start within the click itself, before any flip animation or awaited work.
    void audio.play().catch(error => {
      if (current !== request) return;
      starting = false;
      announce(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Press play to start listening.' : 'This recording could not play. Please try again.');
      playbackState();
    });
  }
  function renewSource() {
    if (!active) return;
    resumeTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const source = new URL(active.dataset.audioUrl!, window.location.href);
    source.searchParams.set('renew', String(Date.now()));
    audio.src = source.href;
    audio.load();
  }
  function flip(card: HTMLButtonElement, selected: boolean) {
    card.toggleAttribute('data-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    if (selected) card.setAttribute('aria-describedby', card.dataset.descriptionId!);
    else card.removeAttribute('aria-describedby');
    card.querySelector('.meditation-front')!.setAttribute('aria-hidden', String(selected));
    card.querySelector('.meditation-back')!.setAttribute('aria-hidden', String(!selected));
    if (!selected) {
      card.setAttribute('aria-label', `Play ${card.dataset.title}`);
      card.querySelectorAll('[data-card-play-icon]').forEach(icon => icon.removeAttribute('hidden'));
      card.querySelectorAll('[data-card-pause-icon]').forEach(icon => icon.setAttribute('hidden', ''));
    }
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
    resumeTime = undefined;
    automaticRetries = 0;
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
        title: card.dataset.title, artist: 'Meg Van Deusen', album: 'Guided practices',
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
    resumeTime = undefined;
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
  cards.forEach(card => { card.disabled = false; card.addEventListener('click', () => select(card), options); });
  toggle.addEventListener('click', () => { if (starting || !audio.paused) pause(); else play(); }, options);
  close.addEventListener('click', () => stop(true), options);
  document.addEventListener('click', event => {
    if (!active || !(event.target instanceof Node)) return;
    // Player controls remain interactive; clicking another card switches tracks.
    if (player.contains(event.target) || cards.some(card => card.contains(event.target as Node))) return;
    stop(false);
  }, options);
  seek.addEventListener('pointerdown', () => { scrubbing = true; }, options);
  seek.addEventListener('keydown', event => {
    const offsets: Record<string, number> = {ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5};
    if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    scrubbing = false;
    seekTo(event.key === 'Home' ? 0 : event.key === 'End' ? duration() : audio.currentTime + offsets[event.key]);
  }, options);
  const finishScrub = () => { scrubbing = false; updateTime(); };
  document.addEventListener('pointerup', finishScrub, options);
  document.addEventListener('pointercancel', finishScrub, options);
  seek.addEventListener('keyup', finishScrub, options);
  seek.addEventListener('blur', finishScrub, options);
  seek.addEventListener('input', () => {
    const time = clampAudioTime(Number(seek.value), duration());
    seekTo(time);
    elapsed.textContent = formatAudioTime(time);
    seek.style.setProperty('--played', `${duration() ? time / duration() * 100 : 0}%`);
    seek.setAttribute('aria-valuetext', `${formatAudioTime(time)} of ${formatAudioTime(duration())}`);
  }, options);
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) audio.addEventListener(event, updateTime, options);
  for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, playbackState, options);
  audio.addEventListener('playing', () => { starting = false; announce(''); startProgress(); }, options);
  for (const event of ['pause', 'ended', 'waiting', 'emptied', 'error']) audio.addEventListener(event, stopProgress, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopProgress(); else { updateTime(); startProgress(); }
  }, options);
  audio.addEventListener('ended', () => { wantsPlayback = false; starting = false; announce('Practice complete. Take a moment before continuing.'); }, options);
  audio.addEventListener('waiting', () => { if (!audio.paused) announce('Buffering…'); }, options);
  audio.addEventListener('canplay', () => { if (!audio.paused) announce(''); }, options);
  audio.addEventListener('loadedmetadata', () => {
    if (resumeTime === undefined) return;
    const time = resumeTime; resumeTime = undefined;
    seekTo(time);
  }, options);
  audio.addEventListener('error', () => {
    if (!active) return;
    // A signed media link can expire while paused. Reauthorize once and keep
    // the position; persistent/offline/auth errors must not cause retry loops.
    if (automaticRetries++ === 0) {
      const resume = wantsPlayback;
      renewSource();
      if (resume) play();
      return;
    }
    starting = false; announce('This recording could not load. Please try again.'); playbackState();
  }, options);
  artwork.addEventListener('error', () => { artwork.hidden = true; }, options);
  const observer = new ResizeObserver(() => {
    if (!player.hidden) root.style.setProperty('--player-height', `${player.getBoundingClientRect().height}px`);
  });
  observer.observe(player);
  window.addEventListener('pagehide', () => stop(false), options);
  return () => { stop(false); listeners.abort(); observer.disconnect(); };
}
