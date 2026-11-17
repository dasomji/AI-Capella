import {
  createPlayerPart,
  createMixerVolume,
  createButton,
  createIconButton,
  createInput,
  createField,
  createLibraryPart,
  createPanelPart,
} from "./index";
/** The main screen's domain shell. Musical canvases retain their original layout; every control is a primitive. */
interface MainCopy {
  t: (
    key:
      | "addArrangement"
      | "addSection"
      | "back"
      | "dropHere"
      | "dropTip"
      | "faster"
      | "followMusic"
      | "followMusicHint"
      | "goToBar"
      | "higher"
      | "key"
      | "lower"
      | "menu"
      | "metronome"
      | "mode"
      | "nextBar"
      | "othersWhileSoloing"
      | "pianoRoll"
      | "play"
      | "practiseAlone"
      | "prevBar"
      | "rehearseTogether"
      | "repertoire"
      | "reset"
      | "saveDefaults"
      | "searchTitles"
      | "sheetMusic"
      | "slower"
      | "startTones"
      | "startTonesHint"
      | "stop"
      | "tempo"
      | "view"
      | "voices"
      | "wholePiece"
      | "zoomIn"
      | "zoomOut",
  ) => string;
  pt: (
    key: "createEnsemble" | "invitationNeeded" | "noEnsemble" | "viewSamples",
  ) => string;
  tr: (key: "entry" | "work") => string;
  modeName: (key: "ensemble" | "solo") => string;
  icon: (
    key:
      | "back"
      | "chevronUp"
      | "fitHeight"
      | "flag"
      | "fork"
      | "loop"
      | "metronome"
      | "minus"
      | "mixer"
      | "more"
      | "next"
      | "play"
      | "plus"
      | "prev"
      | "quarter"
      | "roll"
      | "save"
      | "search"
      | "sheet"
      | "stop"
      | "upload"
      | "user"
      | "users",
  ) => Node;
}
function append<T extends Element>(
  parent: T,
  ...children: (Node | string)[]
): T {
  parent.append(...children);
  return parent;
}
/** Shell/renderer geometry only; control appearance belongs to recipes. */
function shell(tag: string, attrs: Record<string, string | boolean> = {}) {
  const el = ["svg", "path"].includes(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, value === true ? "" : String(value));
  return el;
}
function search(copy: MainCopy) {
  const input = createInput({
    variant: "library-search",
    type: "search",
    id: "lib-search",
    attrs: {
      placeholder: copy.t("searchTitles"),
      "aria-label": copy.t("searchTitles"),
    },
  });
  const field = createField({
    variant: "library-search",
    label: copy.t("searchTitles"),
    control: input,
    attrs: { id: "lib-search-wrap", hidden: true },
  });
  field.prepend(copy.icon("search"));
  return field;
}
export function createMainScreen(copy: MainCopy) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    append(
      shell("section", {
        id: "landing",
        "aria-label": "LightScore",
        class: "view",
      }),
      append(
        shell("canvas", {
          id: "landing-ribbons",
          "aria-hidden": "true",
          class: "ribbons",
        }),
      ),
      append(
        shell("h1", { "aria-label": "LightScore", class: "landing-name" }),
        append(shell("span", { class: "ls-l" }), "Light"),
        "Score",
      ),
      append(
        shell("div", { class: "landing-choice" }),
        append(
          shell("p", {
            id: "landing-dedication",
            hidden: true,
            class: "landing-dedication tw:panel-dedication-wait tw:[:root[data-title=zeile]_&]:panel-dedication-staff tw:[:root[data-title=buehne]_&]:panel-dedication-night",
          }),
        ),
        append(
          createLibraryPart("div", "landing-empty", {
            attrs: { id: "landing-empty", hidden: true },
          }),
          append(shell("p", {}), copy.pt("noEnsemble")),
          append(
            createPanelPart("p", "ctl-note", { attrs: {} }),
            copy.pt("invitationNeeded"),
          ),
          append(
            createButton({
              variant: "landing-link",
              intent: "secondary",
              text: "",
              attrs: { id: "landing-samples" },
            }),
            copy.pt("viewSamples"),
          ),
        ),
        append(
          shell("div", { class: "landing-modes" }),
          append(
            createButton({
              variant: "landing-mode",
              intent: "secondary",
              text: "",
              attrs: { id: "mode-solo-btn" },
            }),
            copy.icon("user"),
            append(shell("span", {}), copy.t("practiseAlone")),
          ),
          append(
            createButton({
              variant: "landing-mode",
              intent: "secondary",
              text: "",
              attrs: { id: "mode-ensemble-btn" },
            }),
            copy.icon("users"),
            append(shell("span", {}), copy.t("rehearseTogether")),
          ),
        ),
        append(
          createButton({
            variant: "landing-aside",
            intent: "secondary",
            text: "",
            attrs: { id: "landing-create" },
          }),
          copy.pt("createEnsemble"),
        ),
      ),
    ),
  );
  fragment.append(
    append(
      shell("section", { id: "library", class: "view" }),
      append(
        shell("header", { class: "lib-top" }),
        append(
          shell("span", { class: "brand" }),
          append(shell("canvas", { "aria-hidden": "true", class: "mark" })),
          append(
            shell("span", { "aria-label": "LightScore", class: "wordmark" }),
            append(shell("span", { class: "ls-l" }), "Light"),
            "Score",
          ),
        ),
        append(
          shell("div", { class: "lib-top-r" }),
          append(
            createPlayerPart("div", "mode-group", {
              attrs: {
                id: "mode-seg",
                role: "group",
                "aria-label": `${copy.t("mode")}`,
              },
            }),
            append(
              createButton({
                variant: "player-segmented",
                intent: "secondary",
                text: "",
                attrs: { "data-action": "mode", "data-mode": "solo" },
              }),
              copy.icon("user"),
              append(shell("span", {}), copy.modeName("solo")),
            ),
            append(
              createButton({
                variant: "player-segmented",
                intent: "secondary",
                text: "",
                attrs: { "data-action": "mode", "data-mode": "ensemble" },
              }),
              copy.icon("users"),
              append(shell("span", {}), copy.modeName("ensemble")),
              append(
                createPlayerPart("i", "live-dot", {
                  attrs: { "aria-hidden": "true" },
                }),
              ),
            ),
          ),
          append(
            createIconButton({
              variant: "standard",
              label: `${copy.t("menu")}`,
              attrs: { id: "lib-menu-btn" },
            }),
            copy.icon("more"),
          ),
        ),
      ),
      append(
        shell("div", { class: "lib-scroll" }),
        append(
          shell("div", { class: "lib-head" }),
          append(
            shell("div", {}),
            append(shell("h1", { id: "lib-title" }), copy.t("repertoire")),
            append(shell("p", { id: "lib-count" })),
          ),
          append(
            shell("div", { class: "lib-tools" }),
            search(copy),
            append(
              createButton({
                variant: "library-action",
                intent: "secondary",
                text: "",
                attrs: { id: "transcription-entry", hidden: true },
                layout: "tw:max-compact:flex-1",
              }),
              append(
                shell("svg", {
                  "aria-hidden": "true",
                  width: "22",
                  height: "22",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "1.5",
                }),
                append(
                  shell("path", {
                    d: "M14 3H5v18h14V9M14 3v6h5M8 12h7M8 16h7M19 1v6M16 4h6",
                  }),
                ),
              ),
              append(shell("span", {}), copy.tr("entry")),
            ),
            append(
              createButton({
                variant: "library-action",
                intent: "primary",
                text: "",
                attrs: { id: "import-btn" },
                layout: "tw:max-compact:flex-1",
              }),
              copy.icon("plus"),
              append(shell("span", {}), copy.t("addArrangement")),
            ),
          ),
        ),
        append(
          shell("section", {
            id: "transcription-jobs",
            hidden: true,
            "aria-label": `${copy.tr("work")}`,
          }),
        ),
        append(
          createLibraryPart("div", "banner", {
            attrs: { id: "lib-banner", role: "status", hidden: true },
          }),
        ),
        append(
          createLibraryPart("ul", "song-grid", { attrs: { id: "song-grid" } }),
        ),
        append(
          shell("p", { class: "lib-tip" }),
          copy.icon("upload"),
          append(shell("span", {}), copy.t("dropTip")),
        ),
      ),
      append(
        shell("div", { "aria-hidden": "true", class: "drop-veil" }),
        append(shell("span", {}), copy.icon("upload"), copy.t("dropHere")),
      ),
      append(
        shell("input", {
          id: "import-input",
          type: "file",
          accept: ".musicxml,.xml,.mxl,.mid,.midi",
          multiple: true,
          hidden: true,
        }),
      ),
    ),
  );
  fragment.append(
    append(
      shell("section", { id: "player", class: "view" }),
      append(
        createPlayerPart("header", "header", { attrs: {} }),
        append(
          createButton({
            variant: "player-back",
            intent: "secondary",
            text: "",
            attrs: { id: "library-back-btn" },
          }),
          copy.icon("back"),
          append(shell("span", {}), copy.t("back")),
        ),
        append(
          createPlayerPart("div", "title", { attrs: {} }),
          append(
            createPlayerPart("h2", "song-title", {
              attrs: { id: "song-title" },
            }),
          ),
          append(
            createPlayerPart("span", "song-meta", {
              attrs: { id: "song-meta" },
            }),
          ),
        ),
        append(
          createPlayerPart("div", "header-actions", { attrs: {} }),
          append(
            createPlayerPart("div", "view-group", {
              attrs: {
                id: "view-seg",
                role: "group",
                "aria-label": `${copy.t("view")}`,
              },
            }),
            append(
              createButton({
                variant: "player-segmented",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "view",
                  "data-view": "roll",
                  "aria-label": `${copy.t("pianoRoll")}`,
                },
              }),
              copy.icon("roll"),
              append(shell("span", {}), copy.t("pianoRoll")),
            ),
            append(
              createButton({
                variant: "player-segmented",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "view",
                  "data-view": "staff",
                  "aria-label": `${copy.t("sheetMusic")}`,
                },
              }),
              copy.icon("sheet"),
              append(shell("span", {}), copy.t("sheetMusic")),
            ),
          ),
          append(
            createButton({
              variant: "player-mode",
              intent: "secondary",
              text: "",
              attrs: { id: "mode-badge" },
            }),
          ),
          append(
            createIconButton({
              variant: "player-landscape",
              label: `${copy.t("voices")}`,
              attrs: { "data-action": "open-mixer" },
            }),
            copy.icon("mixer"),
          ),
          append(
            createIconButton({
              variant: "player",
              label: `${copy.t("menu")}`,
              attrs: { id: "player-menu-btn" },
            }),
            copy.icon("more"),
          ),
        ),
      ),
      append(
        createPlayerPart("aside", "voices-panel", {
          attrs: { "aria-label": `${copy.t("voices")}` },
        }),
        append(
          createPlayerPart("div", "panel-head", { attrs: {} }),
          append(
            createPlayerPart("span", "label", { attrs: {} }),
            copy.t("voices"),
          ),
          append(
            createButton({
              variant: "player-reset",
              intent: "secondary",
              text: "",
              attrs: { "data-action": "mix-reset" },
            }),
            copy.t("reset"),
          ),
        ),
        append(
          createPlayerPart("ul", "voice-list", { attrs: { id: "voice-list" } }),
        ),
        createMixerVolume({
          id: "duck-range-side",
          label: copy.t("othersWhileSoloing"),
        }),
      ),
      append(
        createPlayerPart("div", "chips", {
          attrs: {
            id: "voice-chips",
            role: "group",
            "aria-label": `${copy.t("voices")}`,
          },
        }),
      ),
      append(
        createPlayerPart("div", "chips-mixer", { attrs: {} }),
        append(
          createButton({
            variant: "player-mixer-chip",
            intent: "secondary",
            text: "",
            attrs: {
              "data-action": "open-mixer",
              "aria-label": `${copy.t("voices")}`,
            },
          }),
          copy.icon("mixer"),
        ),
      ),
      append(
        shell("div", { id: "stage", class: "stage" }),
        append(shell("canvas", { id: "roll" })),
        append(shell("canvas", { id: "staff", hidden: true })),
        append(
          createPlayerPart("div", "zoom", {
            attrs: { role: "group", "aria-label": "Zoom" },
          }),
          append(
            createIconButton({
              variant: "player-follow",
              label: `${copy.t("followMusic")}`,
              attrs: {
                "data-action": "follow",
                title: `${copy.t("followMusicHint")}`,
              },
              pressed: true,
            }),
            copy.icon("fitHeight"),
          ),
          append(
            createPlayerPart("span", "zoom-separator", {
              attrs: { "aria-hidden": "true" },
            }),
          ),
          append(
            createIconButton({
              variant: "player-zoom",
              label: `${copy.t("zoomOut")}`,
              attrs: { "data-action": "zoom-out" },
            }),
            copy.icon("minus"),
          ),
          append(
            createPlayerPart("span", "zoom-value", {
              attrs: { id: "zoom-value" },
            }),
            "100%",
          ),
          append(
            createIconButton({
              variant: "player-zoom",
              label: `${copy.t("zoomIn")}`,
              attrs: { "data-action": "zoom-in" },
            }),
            copy.icon("plus"),
          ),
        ),
      ),
      append(
        shell("div", { id: "overview-wrap", class: "overview" }),
        append(
          shell("canvas", { id: "overview", title: `${copy.t("wholePiece")}` }),
        ),
        append(
          createPanelPart("div", "section-marks", {
            attrs: { id: "section-marks" },
          }),
        ),
        append(
          createIconButton({
            variant: "section-add",
            label: `${copy.t("addSection")}`,
            attrs: {
              id: "section-add-btn",
              "data-action": "section-add",
              title: `${copy.t("addSection")}`,
            },
          }),
          copy.icon("flag"),
        ),
      ),
      append(
        createButton({
          variant: "player-info",
          intent: "secondary",
          text: "",
          attrs: { "data-action": "open-controls" },
        }),
        append(
          shell("span", {}),
          append(shell("b", { "data-bind": "pos-bar" })),
          append(shell("span", { "data-bind": "pos-beat-short" })),
        ),
        append(
          shell("span", { class: "info-tempo" }),
          copy.icon("quarter"),
          append(shell("b", { "data-bind": "bpm" })),
        ),
        append(
          shell("span", {}),
          copy.t("key"),
          " ",
          append(shell("b", { "data-bind": "transpose" })),
        ),
        append(
          createPlayerPart("span", "info-indicator", {
            attrs: { "data-bind-metro": true },
          }),
          copy.icon("metronome"),
        ),
        append(
          createPlayerPart("span", "info-indicator", {
            attrs: { "data-bind-tones": true },
          }),
          copy.icon("fork"),
        ),
        "\n      ",
        copy.icon("chevronUp"),
        "\n    ",
      ),
      append(
        createPlayerPart("footer", "transport", { attrs: {} }),
        append(
          createButton({
            variant: "player-position",
            intent: "secondary",
            text: "",
            attrs: {
              "data-action": "goto",
              "aria-label": `${copy.t("goToBar")}`,
            },
          }),
          append(shell("b", { "data-bind": "pos-bar" })),
          append(shell("span", { "data-bind": "pos-beat" })),
        ),
        append(
          createPlayerPart("div", "transport-center", { attrs: {} }),
          append(
            createButton({
              variant: "player-stop-left",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "stop",
                "aria-label": `${copy.t("stop")}`,
                title: `${copy.t("stop")}`,
              },
            }),
            copy.icon("stop"),
          ),
          append(
            createButton({
              variant: "player-transport",
              intent: "secondary",
              text: "",
              attrs: {
                "data-hold": "-1",
                "aria-label": `${copy.t("prevBar")}`,
                title: `${copy.t("prevBar")}`,
              },
            }),
            copy.icon("prev"),
          ),
          append(
            createButton({
              variant: "player-stop-mid",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "stop",
                "aria-label": `${copy.t("stop")}`,
                title: `${copy.t("stop")}`,
              },
            }),
            copy.icon("stop"),
          ),
          append(
            createButton({
              variant: "player-play",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "play",
                "aria-label": `${copy.t("play")}`,
              },
            }),
            copy.icon("play"),
          ),
          append(
            createButton({
              variant: "player-transport",
              intent: "secondary",
              text: "",
              attrs: {
                "data-hold": "1",
                "aria-label": `${copy.t("nextBar")}`,
                title: `${copy.t("nextBar")}`,
              },
            }),
            copy.icon("next"),
          ),
          append(
            createPlayerPart("span", "transport-separator", {
              attrs: { "aria-hidden": "true" },
            }),
          ),
          append(
            createButton({
              variant: "player-toggle",
              intent: "secondary",
              text: "",
              attrs: { "data-action": "loop" },
              pressed: false,
            }),
            copy.icon("loop"),
          ),
          append(
            createButton({
              variant: "player-preference",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "metronome",
                "aria-label": `${copy.t("metronome")}`,
                title: `${copy.t("metronome")}`,
              },
              pressed: false,
            }),
            copy.icon("metronome"),
          ),
          append(
            createButton({
              variant: "player-preference",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "start-tones",
                "aria-label": `${copy.t("startTones")}`,
                title: `${copy.t("startTonesHint")}`,
              },
              pressed: false,
            }),
            copy.icon("fork"),
          ),
        ),
        append(
          createPlayerPart("div", "transport-right", { attrs: {} }),
          append(
            createPanelPart("div", "stepper", {
              attrs: { role: "group", "aria-label": `${copy.t("tempo")}` },
            }),
            append(
              createButton({
                variant: "panel-step",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "bpm-down",
                  "aria-label": `${copy.t("slower")}`,
                },
              }),
              copy.icon("minus"),
            ),
            append(
              createButton({
                variant: "panel-tempo",
                intent: "secondary",
                text: "",
                attrs: { "data-action": "open-tempo" },
              }),
              copy.icon("quarter"),
              append(
                shell("span", {}),
                "= ",
                append(shell("b", { "data-bind": "bpm" })),
              ),
            ),
            append(
              createButton({
                variant: "panel-step",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "bpm-up",
                  "aria-label": `${copy.t("faster")}`,
                },
              }),
              copy.icon("plus"),
            ),
          ),
          append(
            createPanelPart("div", "stepper", {
              attrs: { role: "group", "aria-label": `${copy.t("key")}` },
            }),
            append(
              createPanelPart("span", "label", { attrs: {} }),
              copy.t("key"),
            ),
            append(
              createButton({
                variant: "panel-step",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "transpose-down",
                  "aria-label": `${copy.t("lower")}`,
                },
              }),
              copy.icon("minus"),
            ),
            append(
              createPanelPart("span", "stepper-value", { attrs: {} }),
              append(shell("b", { "data-bind": "key-short" })),
            ),
            append(
              createButton({
                variant: "panel-step",
                intent: "secondary",
                text: "",
                attrs: {
                  "data-action": "transpose-up",
                  "aria-label": `${copy.t("higher")}`,
                },
              }),
              copy.icon("plus"),
            ),
          ),
          append(
            createButton({
              variant: "player-save",
              intent: "secondary",
              text: "",
              attrs: {
                "data-action": "save-defaults",
                "aria-label": `${copy.t("saveDefaults")}`,
                title: `${copy.t("saveDefaults")}`,
                hidden: true,
              },
            }),
            copy.icon("save"),
          ),
        ),
      ),
    ),
  );
  return fragment;
}
