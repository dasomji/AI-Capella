import { matchBreakpoint } from "../theme";

/** D48: wide fine-pointer desktops anchor small menus; choose only at open time. */
export function menuPresentation(): "anchored" | "centered" {
  return matchBreakpoint("transport", "min").matches &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ? "anchored" : "centered";
}

/** Collision-aware measured placement; presentation never switches while open (D24). */
export function anchorPopover(
  panel: HTMLElement,
  anchor: HTMLElement,
  align: "start" | "end" | "center" = "end",
) {
  const view = panel.ownerDocument.defaultView!;
  const viewport = view.visualViewport;
  let frame = 0;
  let lastAnchor: DOMRect | undefined;
  const place = () => {
    const gap = parseFloat(getComputedStyle(panel.ownerDocument.documentElement).getPropertyValue("--ds-space-small")) || 0;
    const left = (viewport?.offsetLeft ?? 0) + gap;
    const top = (viewport?.offsetTop ?? 0) + gap;
    const right = left + (viewport?.width ?? view.innerWidth) - 2 * gap;
    const bottom = top + (viewport?.height ?? view.innerHeight) - 2 * gap;
    panel.style.maxWidth = `${Math.max(0, right - left)}px`;
    panel.style.maxHeight = `${Math.max(0, bottom - top)}px`;
    const measured = anchor.getBoundingClientRect();
    if (anchor.isConnected && measured.width > 0 && measured.height > 0) lastAnchor = measured;
    // Grid refreshes can replace the opener. Keep focus in the menu and its last good position.
    if (!lastAnchor) return; // Wait for a measurable anchor before the first placement.
    const a = lastAnchor, p = panel.getBoundingClientRect();
    const x = align === "start" ? a.left : align === "center" ? a.left + (a.width - p.width) / 2 : a.right - p.width;
    const y = a.bottom + gap + p.height <= bottom ? a.bottom + gap : a.top - gap - p.height;
    panel.style.left = `${Math.max(left, Math.min(right - p.width, x))}px`;
    panel.style.top = `${Math.max(top, Math.min(bottom - p.height, y))}px`;
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  observer.observe(anchor);
  view.addEventListener("resize", schedule);
  view.addEventListener("scroll", schedule, true);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  place();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    view.removeEventListener("resize", schedule);
    view.removeEventListener("scroll", schedule, true);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
  };
}

/** Keep native details/summary disclosure + its keyboard contract; escape clipping in the top layer. */
export function bindRowMenu(details: HTMLDetailsElement, panel: HTMLElement) {
  const anchor = details.querySelector<HTMLElement>("summary")!;
  let unplace: (() => void) | undefined;
  panel.setAttribute("popover", "manual");
  const sync = () => {
    unplace?.();
    unplace = undefined;
    if (details.open) {
      panel.showPopover?.();
      unplace = anchorPopover(panel, anchor);
    } else panel.hidePopover?.();
    anchor.setAttribute("aria-expanded", String(details.open));
  };
  const outside = (event: PointerEvent) => {
    if (details.open && !panel.contains(event.target as Node) && !anchor.contains(event.target as Node))
      details.open = false;
  };
  const onKey = (event: KeyboardEvent) => {
    // Existing disclosure handlers focus the first/last command synchronously on ArrowDown/Up.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      details.open = true;
      sync();
    }
  };
  anchor.addEventListener("keydown", onKey, true);
  // MutationObserver runs before the queued toggle event, including programmatic opens.
  const observer = new MutationObserver(sync);
  observer.observe(details, { attributes: true, attributeFilter: ["open"] });
  details.addEventListener("toggle", sync);
  panel.ownerDocument.addEventListener("pointerdown", outside);
  return () => {
    observer.disconnect();
    details.removeEventListener("toggle", sync);
    anchor.removeEventListener("keydown", onKey, true);
    panel.ownerDocument.removeEventListener("pointerdown", outside);
    unplace?.();
    panel.hidePopover?.();
    panel.removeAttribute("popover");
  };
}
