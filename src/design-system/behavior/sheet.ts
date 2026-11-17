/** Shared sheet transport; native modality remains owned by openDialog. */
export function sheetMotion(dialog: HTMLDialogElement, requestSwipe: () => void) {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let end: ((event: TransitionEvent) => void) | undefined;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const unbind = swipeToDismiss(dialog, requestSwipe);
  dialog.dataset.sheetState = reduced() ? 'open' : 'entering';
  const clear = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    if (end) dialog.removeEventListener('transitionend', end);
  };
  return {
    enter() {
      // Establish the offscreen start after showModal, before changing the target next frame.
      dialog.getBoundingClientRect();
      frame = requestAnimationFrame(() => { dialog.dataset.sheetState = 'open'; });
    },
    exit(finish: () => void) {
      clear();
      dialog.dataset.sheetState = 'closing';
      const duration = Math.max(0, ...getComputedStyle(dialog).transitionDuration.split(',').map(value =>
        parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0));
      if (reduced() || !duration) { finish(); return; }
      const done = () => { clear(); finish(); };
      end = event => {
        if (event.target === dialog && event.propertyName === 'transform') done();
      };
      dialog.addEventListener('transitionend', end);
      timer = setTimeout(done, duration + 50);
    },
    dispose() { clear(); unbind(); delete dialog.dataset.sheetState; },
  };
}

export function swipeToDismiss(panel: HTMLElement, close: () => void) {
  let frame = 0;
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let tracking = false;
  let dragging = false;
  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    tracking = panel.scrollTop <= 0;
    dragging = false;
    startY = e.touches[0].clientY;
    startT = performance.now();
    dy = 0;
  };
  const move = (e: TouchEvent) => {
    if (!tracking) return;
    dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (dy < -4) tracking = false; // scrolling the content up, not pulling the sheet
      if (dy <= 8) return;
      dragging = true;
      panel.style.transition = 'none';
    }
    e.preventDefault();
    panel.style.transform = `translateY(${Math.max(0, dy - 8)}px)`;
  };
  const end = () => {
    if (!dragging) {
      tracking = false;
      return;
    }
    const speed = dy / Math.max(1, performance.now() - startT); // px per ms
    tracking = false;
    dragging = false;
    panel.style.transition = '';
    if (dy > Math.min(140, panel.offsetHeight * 0.3) || (speed > 0.6 && dy > 30)) {
      // Leave the sheet where the finger let go; the closing transition takes it from there.
      frame = requestAnimationFrame(() => {
        panel.style.transform = '';
        close();
      });
    } else panel.style.transform = '';
  };
  panel.addEventListener('touchstart', start, { passive: true });
  panel.addEventListener('touchmove', move, { passive: false });
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
  return () => {
    cancelAnimationFrame(frame);
    panel.removeEventListener('touchstart', start);
    panel.removeEventListener('touchmove', move);
    panel.removeEventListener('touchend', end);
    panel.removeEventListener('touchcancel', end);
    panel.style.transition = '';
    panel.style.transform = '';
  };
}

