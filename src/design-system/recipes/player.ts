import { normalizeRecipe } from "./normalize";
import { buttonRecipe, iconButtonRecipe } from "./controls";
/** D2: player chrome is a musical domain composition over shared controls.
 * Retain the separate phone footer, sheet mixer and theme materials pending owner decisions.
 * Unprefixed names are delegation/intro compatibility hooks, not appearance owners. */
const playerParts = {"header": "ds-player-part ds-player-p-top p-top", "title": "ds-player-part ds-player-p-title p-title", "header-actions": "ds-player-part ds-player-p-top-r p-top-r", "song-title": "ds-player-part ds-player-song-title song-title", "song-meta": "ds-player-part ds-player-song-meta song-meta", "voices-panel": "ds-player-part ds-player-voices-panel voices-panel", "panel-head": "ds-player-part ds-player-panel-head panel-head", "label": "ds-player-part ds-player-label label", "voice-list": "ds-player-part ds-player-voice-list voice-list", "voice-row": "ds-player-part ds-player-voice-row voice-row", "light": "ds-player-part ds-player-light light", "chips": "ds-player-part ds-player-chips chips", "chips-mixer": "ds-player-part ds-player-chips-mixer chips-mixer", "duck": "ds-player-part ds-player-duck duck", "duck-row": "ds-player-part ds-player-duck-row duck-row", "duck-value": "ds-player-part ds-player-duck-value duck-value", "transport": "ds-player-part ds-player-transport transport", "transport-center": "ds-player-part ds-player-t-center t-center", "transport-right": "ds-player-part ds-player-t-right t-right", "transport-separator": "ds-player-part ds-player-t-sep t-sep", "info-indicator": "ds-player-part ds-player-info-metro info-metro", "zoom": "ds-player-part ds-player-zoom zoom", "zoom-separator": "ds-player-part ds-player-zoom-sep zoom-sep", "zoom-value": "ds-player-part ds-player-zoom-value zoom-value", "mode-group": "ds-player-part ds-player-seg ds-player-mode-seg seg mode-seg", "view-group": "ds-player-part ds-player-seg ds-player-view-seg seg view-seg", "live-dot": "ds-player-part ds-player-live-dot live-dot", "mixer-body": "ds-player-part ds-player-sheet-body sheet-body", "switch-block": "ds-player-part ds-player-ctl-block ds-player-switch-row ctl-block switch-row", "switch-copy": "ds-player-part ds-player-switch-copy switch-copy", "note": "ds-player-part ds-player-ctl-note ctl-note"} as const;
export type PlayerPart = keyof typeof playerParts;
export function playerPartRecipe(part: PlayerPart) { return normalizeRecipe(playerParts[part]); }
export function transportRecipe() {
 return {root:playerPartRecipe("transport"),center:playerPartRecipe("transport-center"),right:playerPartRecipe("transport-right"),
 play:buttonRecipe({variant:"player-play"}),command:buttonRecipe({variant:"player-transport"}),toggle:buttonRecipe({variant:"player-toggle"})};
}
export function voiceRowRecipe() {
 return {root:playerPartRecipe("voice-row"),light:playerPartRecipe("light"),name:buttonRecipe({variant:"player-voice-name"}),mute:buttonRecipe({variant:"player-mute"}),solo:buttonRecipe({variant:"player-solo"}),more:iconButtonRecipe({variant:"voice-more"})};
}
export function voiceChipRecipe() { return buttonRecipe({variant:"player-chip"}); }
