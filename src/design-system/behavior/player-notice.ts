/** Keep a persistent notice between the player header and its variable-height footer.
 * The numbered voice key can wrap below the transport; viewport offsets alone cannot
 * describe that space. Geometry stays local, as it does for anchored popovers.
 */
export function placePlayerNotice(notice: HTMLElement, player: HTMLElement) {
  const view = notice.ownerDocument.defaultView!;
  const viewport = view.visualViewport;
  let footer: HTMLElement[] = [];
  const header = [...player.querySelectorAll<HTMLElement>(".p-top,.chips")];
  let frame = 0;
  const visibleRects = (elements: HTMLElement[]) => elements
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  const place = () => {
    const foot = visibleRects(footer);
    if (!foot.length) {
      notice.style.removeProperty("bottom");
      notice.style.removeProperty("max-height");
      return;
    }
    // Also clear the entrance's downward translation (space-content).
    const gap = parseFloat(getComputedStyle(notice.ownerDocument.documentElement)
      .getPropertyValue("--ds-space-content")) || 0;
    const top = Math.max(viewport?.offsetTop ?? 0, ...visibleRects(header).map(rect => rect.bottom)) + gap;
    const bottom = Math.min((viewport?.offsetTop ?? 0) + (viewport?.height ?? view.innerHeight), ...foot.map(rect => rect.top)) - gap;
    notice.style.bottom = `${view.innerHeight - bottom}px`;
    notice.style.maxHeight = `${Math.max(0, bottom - top)}px`;
  };
  const schedule = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(place);
  };
  const observer = new ResizeObserver(schedule);
  const observeLayout = () => {
    footer = [...player.querySelectorAll<HTMLElement>(".info-row,.transport,[data-voice-key]")];
    observer.disconnect();
    for (const element of [player, ...footer, ...header]) observer.observe(element);
  };
  // Opening another piece replaces the direct-child voice key. Avoid observing the
  // playing position's text updates: only structural player children matter here.
  const children = new MutationObserver(() => { observeLayout(); schedule(); });
  children.observe(player, { childList: true });
  observeLayout();
  view.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  place();
  return () => {
    view.cancelAnimationFrame(frame);
    observer.disconnect();
    children.disconnect();
    view.removeEventListener("resize", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
  };
}
