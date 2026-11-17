// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as r from "../src/design-system/recipes";
import { controlNoteRecipe } from "../src/design-system/recipes/shell";
import { scanDesignFile } from "../scripts/check-design-tokens.mjs";
describe("pure recipes", () => {
  it("preserves close typography and native domain select treatment", () => {
    expect(r.iconButtonRecipe({ variant: "transcription" })).toContain(
      "tw:text-close",
    );
    expect(r.iconButtonRecipe({ variant: "admin-close" })).toContain(
      "tw:text-admin-close",
    );
    expect(r.selectRecipe({ variant: "domain" })).toContain("tw:border-b-(length:--ds-stroke-thin)");
    expect(r.inputRecipe({ variant: "domain" })).toContain("tw:font-control");
    expect(r.cardRecipe({ variant: "tour" })).toContain("tw:pt-row");
  });
  it("gives the notifier and specimens one recipe plus a named placement", () => {
    expect(r.toastRecipe()).toContain("ds-reset");
    expect(r.toastRecipe({ kind: "error" })).toContain("tw:bg-danger");
    expect(r.toastPlacementRecipe()).toContain("ds-toast-placement");
    expect(r.toastRecipe({ font: "auth" })).toContain("tw:font-auth-body");
    expect(r.toastRecipe({ font: "auth" })).not.toContain("tw:font-body");
  });
  it("have zero guard violations, forbidden imports or runtime dependencies", () => {
    for (const file of readdirSync("src/design-system/recipes")) {
      const source = readFileSync("src/design-system/recipes/" + file, "utf8");
      expect(
        scanDesignFile("src/design-system/recipes/" + file, source),
      ).toEqual([]);
    }
    expect(
      scanDesignFile(
        "src/design-system/recipes/bad.ts",
        'export { createButton } from "../dom"',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "recipe-boundary" }),
      ]),
    );
  });
  it("has exactly one shape, height, font, size and intent per button variant", () => {
    for (const variant of r.buttonVariants)
      for (const intent of [
        "secondary",
        "primary",
        "danger",
        "quiet",
      ] as const) {
        const classes = r.buttonRecipe({ variant, intent }).split(/\s+/);
        if (variant.startsWith("panel-") || variant.startsWith("section-")) {
          expect(classes).toContain("ds-panel-button");
          expect(classes).toContain("tw:font-family-inherit");
          expect(classes).toContain("tw:focus-visible:[outline-color:var(--ds-ink)]");
          expect(classes.some(c => c.startsWith("tw:"))).toBe(true);
          expect(new Set(classes).size).toBe(classes.length);
          continue;
        }
        if (variant.startsWith("player-")) {
          expect(classes.some(c => c.startsWith("tw:"))).toBe(true);
          expect(classes).toContain("ds-player-button");
          expect(new Set(classes).size).toBe(classes.length);
          continue;
        }
        // Domain appearances share token utilities across React and DOM adapters.
        if (["ensemble-switch", "ensemble-other", "account-delete-confirm", "device-link", "landing-link", "landing-aside", "library-open", "landing-mode", "paper-choice", "sound-prompt", "offline-update"].includes(variant)) {
          expect(classes.some(c => c.startsWith("tw:"))).toBe(true);
          expect(classes.some(c => /^(ds-navigation-|ds-account-|ds-library-)/.test(c))).toBe(true);
          expect(new Set(classes).size).toBe(classes.length);
          continue;
        }
        for (const group of [
          /^tw:min-h-/,
          /^tw:rounded-/,
          /^tw:text-(button|label|body-small|body|small)$/,
          /^tw:font-(control|auth-mono|auth-body)$/,
          /^tw:bg-/,
        ])
          expect(classes.filter((c) => group.test(c))).toHaveLength(1);
        expect(new Set(classes).size).toBe(classes.length);
      }
    expect(r.buttonRecipe()).toContain("tw:min-h-control-height-touch");
    for (const size of r.buttonSizes) {
      expect(r.buttonRecipe({size})).toContain("tw:rounded-card");
      expect(r.buttonRecipe({size})).toContain(size === "compact" ? "tw:min-h-control-height-compact" : "tw:min-h-control-height-touch");
    }
    expect(r.buttonRecipe({size:"full-width"})).toContain("tw:w-full");
    expect(r.buttonVariants).not.toEqual(expect.arrayContaining(["cta", "pill", "tour", "dense"]));
    expect(r.buttonRecipe({size:"compact",intent:"danger"})).toContain("tw:bg-danger");
  });
  it("defines player appearances in token-backed utilities and reserves CSS for native parts", () => {
    for (const part of ["header", "voice-row", "light", "chips", "transport", "view-group", "mixer-body", "switch-block"] as const) {
      expect(r.playerPartRecipe(part)).toMatch(/(?:^|\s)tw:/);
    }
    for (const variant of ["player", "player-landscape", "player-zoom", "player-follow", "voice-more"] as const) {
      expect(r.iconButtonRecipe({ variant })).toMatch(/(?:^|\s)tw:/);
    }
    expect(r.fieldRecipe({ variant: "player-volume" }).control).toMatch(/(?:^|\s)tw:/);
    expect(r.switchRecipe({ variant: "player-preference" }).root).toMatch(/(?:^|\s)tw:/);
    const css = readFileSync("src/design-system/player.css", "utf8");
    expect(css).not.toMatch(/(?<![\w-])\d+(?:px|ms)\b|#[a-f\d]{3,8}\b/i);
    const selectors = [...css.matchAll(/(?:^|})\s*(?:\/\*[\s\S]*?\*\/\s*)?([^{}]+)\{/g)]
      .map(match => match[1].trim()).filter(selector => !selector.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) expect(selector).toContain("::");
    expect(r.playerGlyphRecipe("treble")).toContain("tw:font-music");
  });
  it("defines library/account appearance in utilities and keeps only generated decorations in CSS", () => {
    for (const part of r.libraryParts) expect(r.libraryPartRecipe(part)).toMatch(/(?:^|\s)tw:/);
    for (const part of r.accountParts) expect(r.accountPartRecipe(part)).toMatch(/(?:^|\s)tw:/);
    for (const variant of ["library-prompt", "library-sheet", "library-popover"] as const)
      for (const slot of Object.values(r.dialogRecipe({ variant }))) expect(slot).toMatch(/(?:^|\s)tw:/);
    for (const [part, slot] of Object.entries(r.menuRecipe({ variant: "library" }))) {
      if (part === "chevron") expect(slot).toContain("ds-library-menu-chevron"); // Generated decoration is styled by its owning item.
      else expect(slot).toMatch(/(?:^|\s)tw:/);
    }
    for (const file of ["library", "account"]) {
      const css = readFileSync(`src/design-system/${file}.css`, "utf8");
      expect(css).not.toMatch(/(?<![\w-])\d+(?:px|ms)\b|#[a-f\d]{3,8}\b/i);
      const selectors = [...css.matchAll(/(?:^|})\s*(?:\/\*[\s\S]*?\*\/\s*)?([^{}]+)\{/g)]
        .map(match => match[1].trim()).filter(selector => !selector.startsWith("@"));
      for (const selector of selectors) expect(selector).toContain("::");
    }
  });
  it("makes ruled and boxed properties exclusive and exposes stable slots", () => {
    for (const variant of r.fieldVariants) {
      const slots = r.fieldRecipe({ variant });
      expect(Object.keys(slots)).toEqual([
        "root",
        "label",
        "control",
        "hint",
        "error",
      ]);
      if (["search", "numeric", "repeated-name"].includes(variant)) {
        expect(slots.control).toContain("tw:rounded-card");
        expect(slots.control).not.toContain("tw:border-0");
      } else if (!["player-volume", "library-search"].includes(variant) && !variant.startsWith("panel-")) {
        expect(slots.control).toContain("tw:rounded-field");
        expect(slots.control).toContain("tw:border-0");
      }
    }
  });
});

describe("every recipe property is exclusive within a state and breakpoint", () => {
  it("checks every named variant and every part, including sheet max-height", () => {
    const cases: unknown[] = [];
    for (const variant of r.buttonVariants)
      for (const intent of ["primary", "secondary", "danger", "quiet"] as const)
        for (const pressed of [true, false])
          for (const size of r.buttonSizes) cases.push(r.buttonRecipe({ variant, intent, pressed, size }));
    for (const variant of r.iconButtonVariants)
      cases.push(r.iconButtonRecipe({ variant }));
    for (const variant of r.fieldVariants)
      for (const invalid of [true, false])
        cases.push(
          r.fieldRecipe({ variant, invalid }),
          r.inputRecipe({ variant, invalid }),
          r.selectRecipe({ variant, invalid }),
          r.textareaRecipe({ variant, invalid }),
        );
    for (const variant of r.checkboxVariants)
      cases.push(r.checkboxRecipe({ variant }));
    for (const variant of r.switchVariants)
      for (const checked of [true, false])
        cases.push(r.switchRecipe({ variant, checked }));
    for (const variant of r.cardVariants) cases.push(r.cardRecipe({ variant }));
    for (const intent of r.feedbackIntents)
      cases.push(r.badgeRecipe({ intent }), r.statusRecipe({ intent }));
    for (const variant of r.toggleGroupVariants)
      cases.push(r.toggleGroupRecipe({ variant }));
    for (const variant of r.emptyStateVariants)
      cases.push(r.emptyStateRecipe({ variant }));
    for (const variant of r.tableVariants)
      cases.push(r.tableRecipe({ variant }));
    for (const variant of r.dialogVariants)
      cases.push(r.dialogRecipe({ variant }));
    for (const variant of r.menuVariants) cases.push(r.menuRecipe({ variant }));
    for (const kind of r.toastVariants) cases.push(r.toastRecipe({ kind }));
    cases.push(r.toolbarRecipe(), r.loadingRecipe(), r.toastPlacementRecipe());
    const check = (value: unknown) => {
      if (typeof value === "function") {
        check(value(true));
        check(value(false));
        return;
      }
      if (typeof value === "object" && value) {
        Object.values(value).forEach(check);
        return;
      }
      if (typeof value !== "string") return;
      const seen = new Map<string, string>();
      for (const cls of value.split(/\s+/).filter(Boolean)) {
        const bits = cls.split(":");
        const utility = bits.pop()!;
        const state = bits.join(":");
        const group =
          /^(max-h|min-h|max-w|min-w|h|w|bg|leading|opacity)-/.exec(
            utility,
          )?.[1] ??
          (/^font-(control|auth-mono|auth-body|auth-display|body|display|close)$/.test(
            utility,
          )
            ? "font-family"
            : undefined) ??
          (/^font-(label|regular|emphasis|close-light)$/.test(utility)
            ? "font-weight"
            : undefined) ??
          (/^(block|inline-block|flex|inline-flex|grid|inline-grid|hidden)$/.test(
            utility,
          )
            ? "display"
            : undefined);
        if (!group) continue;
        const key = state + ":" + group;
        expect(seen.get(key), value + " duplicates " + key).toBeUndefined();
        seen.set(key, cls);
      }
    };
    cases.forEach(check);
    expect(r.dialogRecipe({ variant: "sheet" }).panel).not.toContain(
      "tw:max-h-dialog",
    );
  });
  it("documents intentional aliases and exposes finite placement and alignment roles", () => {
    expect(r.menuRecipe({ variant: "member" }).root).toContain("tw:min-w-menu-member");
    expect(r.menuRecipe({ variant: "job" }).root).toContain("tw:min-w-menu-job");
    expect(r.dialogRecipe({ variant: "confirm" })).toEqual(
      r.dialogRecipe({ variant: "dialog" }),
    );
    // D16 A: metrics keep their own narrower contained table; scroll keeps record columns.
    expect(r.tableRecipe({ variant: "metrics" }).root).toContain("tw:min-w-(--ds-admin-metrics-width)");
    expect(r.tableRecipe({ variant: "scroll" }).root).toContain("tw:min-w-(--ds-admin-records-width)");
    expect(r.tableRecipe({ variant: "metrics" }).root).not.toContain("tw:max-account:");
    expect(r.fieldRecipe({ variant: "ruled" })).toEqual(
      r.fieldRecipe({ variant: "transcription" }),
    );
    expect(r.layoutClasses).toEqual(
      expect.arrayContaining([
        "tw:col-span-full",
        "tw:self-end",
        "tw:max-panel:hidden",
        "tw:order-first",
      ]),
    );
  });
});

it('preserves unselectable landing notes and the library Menu ink focus outline', () => {
  expect(controlNoteRecipe()).toContain('tw:select-none');
  expect(controlNoteRecipe()).not.toContain('tw:select-text');
  expect(r.panelPartRecipe('ctl-note')).toContain('tw:select-none');
  expect(r.panelPartRecipe('ctl-note')).not.toContain('tw:select-text');
  const menu=r.iconButtonRecipe({variant:'library-menu'});
  expect(menu).toContain('tw:focus-visible:outline-ink');
  expect(menu).not.toContain('tw:focus-visible:outline-focus');
});

it('emits every authored utility through the real app compiler, excluding only structural peer', async () => {
  const {auditDesignUtilities,compileDesignUtilities}=await import('../scripts/check-design-utilities.mjs');
  const result=await auditDesignUtilities();
  expect(result.candidates).toBeGreaterThan(1000);
  expect(result.missing).toEqual([]);
  expect(result.ignoredMarkers.every(marker=>marker==='tw:peer')).toBe(true);
  // Negative controls reproduce a missing semantic offset and an unknown stacking alias.
  expect(await compileDesignUtilities(['tw:focus-visible:outline-offset-compact','tw:z-definitely-absent'])).toEqual([null,null]);
},15000);

it('emits the standard, admin and player focus offsets from their authored spacing roles', async () => {
  const {compileDesignUtilities}=await import('../scripts/check-design-utilities.mjs');
  const {default:postcss}=await import('postcss');
  const cases: [r.ButtonOptions['variant'],string][]=[['standard','compact'],['player-play','micro']];
  for(const [variant,scale] of cases) {
    const candidates=r.buttonRecipe({variant}).split(/\s+/).filter(candidate=>candidate.includes('outline-offset'));
    expect(candidates.length,variant).toBeGreaterThan(0);
    const emitted=await compileDesignUtilities(candidates);
    const values: string[]=[];
    for(const css of emitted){expect(css,variant).not.toBeNull();if(css)postcss.parse(css).walkDecls('outline-offset',d=>{values.push(d.value);});}
    expect(values,variant).toContain(`var(--ds-space-${scale})`);
  }
},15000);

it('keeps player domain compositions equivalent to their shared app controls',()=>{
  expect(r.transportRecipe().play).toBe(r.buttonRecipe({variant:'player-play'}));
  expect(r.transportRecipe().command).toBe(r.buttonRecipe({variant:'player-transport'}));
  expect(r.voiceRowRecipe().name).toBe(r.buttonRecipe({variant:'player-voice-name'}));
  expect(r.voiceRowRecipe().more).toBe(r.iconButtonRecipe({variant:'voice-more'}));
  expect(r.voiceChipRecipe()).toBe(r.buttonRecipe({variant:'player-chip'}));
});


it('keeps errors adjacent, colors invalid writing lines, and restores compact touch targets',()=>{
  expect(r.fieldRecipe({variant:'ruled-account',invalid:true}).control).toContain('tw:border-danger');
  expect(r.fieldRecipe({variant:'ruled-account',invalid:true}).error).not.toContain('tw:text-center');
  expect(r.statusRecipe({variant:'admin',intent:'error'})).toContain('tw:text-danger');
  expect(r.statusRecipe({variant:'admin',intent:'success'})).toContain('tw:text-success');
  expect(r.buttonRecipe({size:'compact'})).toContain('tw:touch:min-h-control-target-touch');
  expect(r.buttonRecipe({size:'compact'})).toContain('tw:touch:min-w-control-target-touch');
  expect(r.checkboxRecipe({density:'compact'}).root).toContain('tw:touch:min-h-control-target-touch');
  expect(r.switchRecipe({variant:'shared-device'}).root).not.toContain('tw:hidden');
  expect(r.emptyStateRecipe({variant:'jobs-hidden'}).root).toContain('tw:hidden');
  expect(r.emptyStateRecipe({variant:'standard'}).title).toBe(r.emptyStateRecipe({variant:'compact'}).title);
  expect(r.cardRecipe({variant:'tour'})).toContain('tw:bg-surface');
  expect(r.cardRecipe({variant:'tour'})).toContain('tw:text-ink');
});
