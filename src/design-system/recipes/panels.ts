import { normalizeRecipe } from "./normalize";
import { buttonRecipe } from "./controls";
/** D2: compositions retain printed marks and numeric/export appearances pending owner decisions. */
const parts = {
  "ctl-block": "ds-panel-part ds-panel-ctl-block ctl-block",
  "ctl-head": "ds-panel-part ds-panel-ctl-head ctl-head",
  "ctl-note": "ds-panel-part ds-panel-ctl-note ctl-note",
  "big-stepper": "ds-panel-part ds-panel-big-stepper big-stepper",
  "big-value": "ds-panel-part ds-panel-big-value big-value",
  presets: "ds-panel-part ds-panel-presets presets",
  "custom-tempo": "ds-panel-part ds-panel-custom-tempo custom-tempo",
  "goto-row": "ds-panel-part ds-panel-goto-row goto-row",
  "mark-row": "ds-panel-part ds-panel-mark-row mark-row",
  "popover-body": "ds-panel-part ds-panel-popover-body popover-body",
  "sheet-body": "ds-panel-part ds-panel-sheet-body sheet-body",
  "offset-body":
    "ds-panel-part ds-panel-offset-body ds-panel-sheet-body sheet-body offset-body",
  "offset-row": "ds-panel-part ds-panel-offset-row offset-row",
  "offset-value": "ds-panel-part ds-panel-offset-value offset-value",
  "export-body":
    "ds-panel-part ds-panel-export-body ds-panel-sheet-body sheet-body export-body",
  "export-voices": "ds-panel-part ds-panel-export-voices export-voices",
  "export-voice-list":
    "ds-panel-part ds-panel-export-voice-list export-voice-list",
  "export-status": "ds-panel-part ds-panel-export-status export-status",
  "scan-marks-body":
    "ds-panel-part ds-panel-scan-marks-body ds-panel-sheet-body sheet-body scan-marks-body",
  "scan-mark-list": "ds-panel-part ds-panel-scan-mark-list scan-mark-list",
  "scan-mark": "ds-panel-part ds-panel-scan-mark scan-mark",
  "scan-q-head": "ds-panel-part ds-panel-scan-q-head scan-q-head",
  "scan-q-text": "ds-panel-part ds-panel-scan-q-text scan-q-text",
  "scan-actions": "ds-panel-part ds-panel-scan-actions scan-actions",
  "scan-mark-img": "ds-panel-part ds-panel-scan-mark-img scan-mark-img",
  label: "ds-panel-part ds-panel-label label",
  stepper: "ds-panel-part ds-panel-stepper stepper",
  "stepper-value": "ds-panel-part ds-panel-stepper-value stepper-value",
  "section-marks": "ds-panel-part ds-panel-section-marks ",
  "section-add": "ds-panel-part ds-panel-section-add ",
  "export-row": "ds-panel-part ds-panel-export-row ",
  "export-summary": "ds-panel-part ds-panel-export-summary ",
  "sync-debug": "ds-panel-part ds-panel-sync-debug sync-debug",
  "fps-probe": "ds-panel-part ds-panel-fps-probe fps-probe",
  "paper-body": "ds-panel-part ds-panel-paper-body paper-body",
} as const;
export type PanelPart = keyof typeof parts;
export function panelPartRecipe(part: PanelPart) {
  return normalizeRecipe(parts[part]);
}
export function sectionMarkRecipe(word = false) {
  return buttonRecipe({ variant: word ? "section-word" : "section-mark" });
}
