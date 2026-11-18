import {
  playerPartRecipe,
  playerGlyphRecipe,
  transportRecipe,
  voiceRowRecipe,
  voiceNumberRecipe,
  voiceKeyRecipe,
  type PlayerPart,
} from "../recipes";
import {
  createButton,
  createIconButton,
  createInput,
  type Attributes,
} from "./index";
/** Named domain slots keep main.ts free of appearance classes. */
function playerElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes: string,
  options: { attrs?: Attributes; text?: string } = {},
) {
  const el = document.createElement(tag);
  el.className = classes;
  if (options.text !== undefined) el.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    if (key === "class" || key === "style" || key.startsWith("on"))
      throw Error("Use named player slots");
    if (value !== undefined) el.setAttribute(key, String(value));
  }
  return el;
}
export function createPlayerPart<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  part: PlayerPart,
  options: { attrs?: Attributes; text?: string } = {},
) {
  return playerElement(tag, playerPartRecipe(part), options);
}
export function createVoiceRow(options: {
  partId: string;
  voiceNumber?: number;
  name: string;
  color: string;
  onlyHint: string;
  muteLabel: string;
  soloLabel: string;
  moreLabel?: string;
  moreIcon?: Node;
}) {
  const slots = voiceRowRecipe();
  const row = playerElement("li", slots.root, {
    attrs: { "data-part": options.partId },
  });
  row.style.setProperty("--c", options.color);
  const light = playerElement("i", slots.light, {
    attrs: { "data-part": options.partId, "aria-hidden": true },
  });
  const name = createButton({
    text: options.name,
    variant:
      options.name.length > 13 ? "player-voice-name-long" : "player-voice-name",
    attrs: { title: options.onlyHint },
  });
  if (options.voiceNumber) name.prepend(voiceBadge(options.voiceNumber));
  row.append(light, name);
  for (const [mix, text, label, variant] of [
    ["muted", "M", options.muteLabel, "player-mute"],
    ["solo", "S", options.soloLabel, "player-solo"],
  ] as const)
    row.append(
      createButton({
        text,
        variant,
        pressed: false,
        attrs: { "data-mix": mix, "aria-label": label, title: label },
      }),
    );
  if (options.moreLabel)
    row.append(
      createIconButton({
        variant: "voice-more",
        label: options.moreLabel,
        icon: options.moreIcon,
        attrs: { title: options.moreLabel },
      }),
    );
  return row;
}
export function createVoiceChip(options: {
  partId: string;
  voiceNumber?: number;
  name: string;
  color: string;
  title: string;
}) {
  const chip = createButton({
    text: "",
    variant: "player-chip",
    attrs: { "data-part": options.partId, title: options.title },
  });
  chip.style.setProperty("--c", options.color);
  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  chip.append(dot);
  if (options.voiceNumber) chip.append(voiceBadge(options.voiceNumber));
  chip.append(document.createTextNode(options.name));
  return chip;
}
export function createMixerVolume(options: { id: string; label: string }) {
  const duck = createPlayerPart("div", "duck"),
    label = createPlayerPart("label", "label", {
      text: options.label,
      attrs: { for: options.id },
    }),
    row = createPlayerPart("div", "duck-row");
  row.append(
    createInput({
      variant: "player-volume",
      type: "range",
      id: options.id,
      attrs: { min: 0, max: 0.75, step: 0.05 },
    }),
    createPlayerPart("output", "duck-value"),
  );
  duck.append(label, row);
  return duck;
}
/** SMuFL is trusted text, never interpreted markup. */
export function createPlayerGlyph(text: string, kind: Parameters<typeof playerGlyphRecipe>[0]) {
  const glyph = document.createElement("span");
  glyph.className = playerGlyphRecipe(kind);
  glyph.textContent = text;
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}
/** Desktop and phone share commands; only the named slots choose their layout. */
export function createTransport(options: {
  position: Node;
  commands: Iterable<Node>;
  controls: Iterable<Node>;
}) {
  const slots = transportRecipe();
  const transport = playerElement("footer", slots.root),
    center = playerElement("div", slots.center),
    right = playerElement("div", slots.right);
  center.append(...options.commands);
  right.append(...options.controls);
  transport.append(options.position, center, right);
  return transport;
}

function voiceBadge(number: number) {
  return playerElement("span", voiceNumberRecipe, {text:String(number),attrs:{"data-voice-number":number}});
}
export function createVoiceKey(label: string, voices: {id:string;name:string;voiceNumber?:number;color:string}[], inspect: (id:string)=>void) {
  const key = playerElement("div", voiceKeyRecipe, {attrs:{role:"group","aria-label":label,"data-voice-key":true}});
  for (const voice of voices) {
    const chip = createVoiceChip({partId:voice.id,name:voice.name,voiceNumber:voice.voiceNumber,color:voice.color,title:voice.name});
    chip.addEventListener('click',()=>inspect(voice.id));
    key.append(chip);
  }
  return key;
}
