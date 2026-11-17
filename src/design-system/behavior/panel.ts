/** Retain the legacy panel's measured entrance and fade while native modality owns focus. */
export function panelMotion(dialog: HTMLDialogElement) {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let end: ((event: TransitionEvent) => void) | undefined;
  const clear = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    if (end) dialog.removeEventListener("transitionend", end);
  };
  dialog.dataset.panelState = "entering";
  return {
    enter() {
      dialog.getBoundingClientRect();
      frame = requestAnimationFrame(() => {
        dialog.dataset.panelState = "open";
      });
    },
    exit(finish: () => void) {
      clear();
      dialog.dataset.panelState = "closing";
      const duration = Math.max(
        0,
        ...getComputedStyle(dialog)
          .transitionDuration.split(",")
          .map(
            (value) =>
              parseFloat(value) * (value.trim().endsWith("ms") ? 1 : 1000) || 0,
          ),
      );
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        !duration
      ) {
        finish();
        return;
      }
      const done = () => {
        clear();
        finish();
      };
      end = (event) => {
        if (event.target === dialog && event.propertyName === "opacity") done();
      };
      dialog.addEventListener("transitionend", end);
      timer = setTimeout(done, duration + 50);
    },
    dispose() {
      clear();
      delete dialog.dataset.panelState;
    },
  };
}
