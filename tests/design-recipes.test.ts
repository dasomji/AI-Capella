// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as r from "../src/design-system/recipes";
import { scanDesignFile } from "../scripts/check-design-tokens.mjs";
describe("pure recipes", () => {
  it("preserves close typography and native domain select treatment", () => {
    expect(r.iconButtonRecipe({ variant: "transcription" })).toContain(
      "tw:text-close",
    );
    expect(r.iconButtonRecipe({ variant: "admin-close" })).toContain(
      "tw:text-admin-close",
    );
    expect(r.selectRecipe({ variant: "domain" })).toContain("tw:px-8");
    expect(r.inputRecipe({ variant: "domain" })).toContain("tw:px-0");
    expect(r.cardRecipe({ variant: "tour" })).toContain("tw:py-14");
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
        for (const group of [
          /^tw:min-h-/,
          /^tw:rounded-/,
          /^tw:text-(button|label|body-small)$/,
          /^tw:font-(control|auth-mono|auth-body)$/,
          /^tw:bg-/,
        ])
          expect(classes.filter((c) => group.test(c))).toHaveLength(1);
        expect(new Set(classes).size).toBe(classes.length);
      }
    expect(r.buttonRecipe()).toContain("tw:min-h-control-height");
    expect(r.buttonRecipe({ variant: "pill" })).not.toContain(
      "tw:rounded-card",
    );
    expect(r.buttonRecipe({ variant: "dense" })).toContain(
      "tw:rounded-admin-control",
    );
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
      expect(slots.control.includes("tw:rounded-card")).toBe(
        variant === "boxed",
      );
      expect(slots.control.includes("tw:rounded-field")).toBe(
        variant !== "boxed",
      );
    }
  });
});

describe("every recipe property is exclusive within a state and breakpoint", () => {
  it("checks every named variant and every part, including sheet max-height", () => {
    const cases: unknown[] = [];
    for (const variant of r.buttonVariants)
      for (const intent of ["primary", "secondary", "danger", "quiet"] as const)
        for (const pressed of [true, false])
          cases.push(r.buttonRecipe({ variant, intent, pressed }));
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
    expect(r.menuRecipe({ variant: "member" })).toEqual(
      r.menuRecipe({ variant: "popover" }),
    );
    expect(r.dialogRecipe({ variant: "confirm" })).toEqual(
      r.dialogRecipe({ variant: "dialog" }),
    );
    expect(r.tableRecipe({ variant: "scroll" })).toEqual(
      r.tableRecipe({ variant: "metrics" }),
    );
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
