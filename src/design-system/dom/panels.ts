import { panelPartRecipe, type PanelPart } from "../recipes";
import { createButton, createInput, type Attributes } from "./index";
export function createPanelPart<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  part: PanelPart,
  options: { text?: string; attrs?: Attributes } = {},
) {
  const el = document.createElement(tag);
  el.className = panelPartRecipe(part);
  if (options.text !== undefined) el.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    if (key === "class" || key === "style" || key.startsWith("on"))
      throw Error("Use named panel slots");
    if (value !== undefined) el.setAttribute(key, String(value));
  }
  return el;
}
/** Printed SectionMark: label is literal user/source text, delegation remains on the native button. */
export function createSectionMark(options: {
  label: string;
  index: number;
  title: string;
  ariaLabel: string;
}) {
  return createButton({
    variant: options.label.length > 2 ? "section-word" : "section-mark",
    text: options.label,
    attrs: {
      "data-action": "section-jump",
      "data-index": options.index,
      title: options.title,
      "aria-label": options.ariaLabel,
    },
  });
}
/** Native offset range. Screen owns units, limits and events. */
export function createOffsetControl(options: {
  hint: string;
  earlier: string;
  later: string;
  value: number;
  label: string;
  id?: string;
  min: number;
  max: number;
  output: string;
}) {
  const body = createPanelPart("div", "offset-body"),
    row = createPanelPart("div", "offset-row"),
    value = createPanelPart("p", "offset-value"),
    out = document.createElement("output");
  const input = createInput({
    variant: "panel-offset",
    type: "range",
    id: options.id,
    value: String(options.value),
    attrs: {
      min: options.min,
      max: options.max,
      step: 5,
      "aria-label": options.label,
    },
  });
  const earlier = document.createElement("span"),
    later = document.createElement("span");
  earlier.textContent = options.earlier;
  later.textContent = options.later;
  out.textContent = options.output;
  if (options.id) out.htmlFor.value = options.id;
  row.append(earlier, input, later);
  value.append(out);
  body.append(
    createPanelPart("p", "ctl-note", { text: options.hint }),
    row,
    value,
  );
  return { body, input, out };
}
