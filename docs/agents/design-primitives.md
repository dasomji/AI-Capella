# Shared primitives (AICAP-28 P3)

Recipes in `src/design-system/recipes` are pure TypeScript with literal `tw:` classes. React
and DOM adapters import the same functions. They have no runtime dependencies. `ds-reset` is
an opt-in slot reset above legacy CSS, including pseudo-elements; it is not global Preflight.
Tokens and the semantic Tailwind mapping remain in `tokens.css`. Custom Tailwind utilities
must be declared at the top level of `app.css`, outside its imported token layer.

## Use in React

```tsx
import { Button, Field, Input, Dialog, toast } from './design-system/react';

<Field label="Email" hint="Used for sign-in" error={error} variant="ruled">
  {association => <Input {...association} type="email" required
    value={email} onChange={event => setEmail(event.target.value)} />}
</Field>
<Button variant="cta" intent="primary" type="submit" busy={saving}>Save</Button>
<Dialog open={open} title="Rename" onCancel={() => setOpen(false)}
  behavior={{ opener: triggerRef.current, busy: saving, busyCancel: 'block', outside: 'ignore' }}>
  {/* Screen-owned form / translated text / validation */}
</Dialog>
```

`Field` supplies ID, described-by and invalid attributes through its render prop; spread them
onto the native control. Native required/email/min/max/step constraints remain native. Explicit
`id` and `describedBy` support external associations. `Input`, `Select`, `Textarea` and buttons
accept native props/ref, aria/data hooks, and a finite `layout` slot. `className`/`style` are
excluded: request a named recipe variant instead of screen-specific aesthetic overrides.

## Use in vanilla DOM

```ts
import {
  createButton,
  createInput,
  createField,
  createSheet,
  toast,
} from "./design-system/dom";

const input = createInput({
  type: "email",
  required: true,
  attrs: { "data-bind": "email", autocomplete: "email" },
});
const field = createField({
  label: "Email",
  control: input,
  variant: "ruled",
  error,
});
const save = createButton({
  text: "Save",
  variant: "cta",
  intent: "primary",
  busy: saving,
  attrs: { "data-action": "save" },
  onClick: saveEmail,
});
const sheet = createSheet({
  title: "Account",
  content: field,
  actions: save,
  behavior: { busyCancel: "block", onClose: () => cleanup() },
});
sheet.open();
sheet.setBusy(true); // cancellation is blocked; explicit sheet.close() completes the work
```

Builders use `textContent`. DOM native attributes go through `attrs`; class/style/event-string
attributes are rejected. Add event listeners normally. `updateButton` and `updateSwitch` change recipe/state in
place and retain existing IDs/data hooks and layout. `updateButton(iconButton, {busy})` retains
its icon recipe; `updateField(field, {error: undefined})` clears error appearance and associations
without replacing or blurring the native control. Both button adapters default to `type=button`.
Busy uses guarded `aria-disabled`, preserving focus; actual `disabled` remains native.
Switches default to command buttons; `mode="checkbox"` / `{mode:'checkbox', name:'permission'}`
preserves native form semantics. Switches and toggle groups are controlled: the owner updates
checked/value after the command succeeds. Use `createMenu(...).dispose()` when removing a menu.

Other exports: IconButton, Select, Textarea, Checkbox, Switch, Surface/Card, Badge, ToggleGroup,
Toolbar, Status, Loading, EmptyState, Sheet, Drawer, ConfirmDialog, Menu, Toast and
Table/TableWrap/TableHeader/TableCell/TableRow/TableEmpty/TablePagination. DOM equivalents use
`create*`; `createTableParts({variant})` binds all table builders to one appearance.
React Table/TableWrap provide variant context to their parts; Field provides control context.
Overlays return `{element, open, close, setBusy}` and menus `{element, dispose}`.
Table cells accept native attributes including `data-label` (phone record labels) and React
`colSpan`/`scope`. Domain fetching, validation, permissions, sorting and translations stay with
screens. These components do not introduce tabs semantics for URL navigation or mode switches.

## Behavior and compatibility

`behavior/openDialog` is the only native modal lifecycle. Native `showModal()` owns background
inertness; never set author `inert` on modal ancestors or newly opened portals. Dialogs stack:
a confirm above a drawer leaves the drawer open, then returns focus into it. Scroll lock lasts
until the final modal closes. React Dialog portals to body, retains title/body ID associations,
and accepts native aria/data/id hooks. Confirm variants default to `role="alertdialog"`.

Always supply `behavior.opener` when available. Pointer capture also remembers the initiating
control for Safari, which may leave `activeElement` on body after a click. `onCancel(reason)` is
for user requests (`escape`, `outside`, `button`, `swipe`); `onClose` reports a completed close.
Controlled `open=false`, unmount and StrictMode replay dispose silently. Use `requestClose()`
for cancel buttons and `close()` after successful work. Policies: `escape`/`outside` =
`close | ignore`, `busyCancel` = `block | allow` (block by default). Explicit close always works.
Legacy sheets/popovers retain the native top layer through `transitionend` or 160ms; reduced
motion closes immediately. Swipe dismiss uses this same exit path.

Menus support ArrowUp/Down, Home/End, Enter/Space, Escape and buffered typeahead. Space continues
a live typeahead buffer; otherwise it activates. Roving focus survives rerenders. React Menu
accepts a `trigger` and `placement="start" | "end"`, focuses the menu when opened, and returns
focus on Escape or selection. Omit trigger only for an intentionally static menu specimen.
Dispose DOM menus when removing them. Busy and disabled commands are guarded in both adapters.

`toast()` is the one lazy notifier across React and DOM; no host component is needed. Its body
host uses a manual popover in the top layer and survives toast-then-close. Text stays through
the 300ms exit fade. Latest message replaces the previous one; durations are 3200ms info /
6500ms error. Errors use `role="alert"`, others `status`. `Toast`/`createToast` and the real host
consume `toastRecipe({kind})`; host geometry uses `toastPlacementRecipe`. Domain-sheet placement
is at the top. There is no legacy toast variant or `#toast` appearance CSS.

`src/ui.ts` keeps its signatures and delegates to `dom/legacy.ts`; existing class/query hooks
remain until screen migration. Native controls keep inherited color-scheme, visibility,
pointer-events, accent-color and print-color-adjust despite the opt-in reset.

## Rules for P4/P5 agents

1. Use typed primitives and named variants. Keep className/style and screen-scoped CSS out of
   call sites. Request new named roles from the primitive owner. `layout` accepts one role or
   an array from `layoutClasses`, including grid placement, self alignment, responsive hiding
   and ordering; it is a finite vocabulary.
2. Retain every data-action/data-bind/id hook. Checkbox hooks belong on its native input in
   both adapters. Dialog, Menu, EmptyState and ToggleGroup forward aria/data/id hooks.
3. Put variant on Field/Table/TableWrap once; controls/table parts inherit it. Explicit part
   overrides remain available. Use `createTableParts` for parent-owned DOM table appearance.
4. Update state with updateButton/updateSwitch/updateField, retaining element identity and
   focus. Clear errors with `updateField(field, {error: undefined})`.
5. Use onCancel for requested cancellation and onClose only for completed-close notification.
   Give dialogs an opener; confirm dialogs may stack above drawers. Never add manual inert
   observers. Toast-then-close is supported.
6. Preserve intentional aliases below until the owner resolves their named decisions. Aliases
   preserve existing looks; they do not promise distinct appearance.
7. Verify keyboard focus, actual Tab wrap/return, nested stacking, native dark controls, menu
   rerenders, toast-then-close and closing transitions in a real browser for every screen slice.
   Attribute/ARIA parity and computed-style parity are complementary checks.

## Pending owner choices and named parity variants

| Recipe                      | Named appearances                                                                                                                       | Pending decision              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| button                      | standard (42px, radius 12), cta (full width, 44px), pill (44px, round), tour (inverted, 38px), dense (44px, radius 3, admin mono), link | D08; dense/link D10; tour D17 |
| button intent               | secondary, primary, danger, quiet; admin danger remains outlined                                                                        | D08 / D14                     |
| icon-button                 | standard (40), small (32), transcription (40), admin-close (28px system close glyph, min-height 44), admin-copy (min-height 32)         | D08 / D10                     |
| field/input/select/textarea | boxed, ruled (account), domain, transcription, admin; label/control/hint/error slots                                                    | D09 / D10                     |
| checkbox                    | standard, permission (20), export (18)                                                                                                  | D11 / D10                     |
| switch                      | player (52×32), admin (48×26), capability (28×16); button or native checkbox semantics                                                  | D11 / D10                     |
| surface/card                | surface, raised, material, admin, tour (inverted)                                                                                       | D12 / D10 / D17               |
| badge/status                | neutral, success, warning, error, accent                                                                                                | D15                           |
| toggle-group                | segmented, language, transcription, admin, presets                                                                                      | D10 / D11                     |
| toolbar                     | one wrapping appearance; screen owns contents                                                                                           | D10                           |
| empty-state                 | landing-actions, library-text, admin-text, jobs-hidden                                                                                  | D17                           |
| loading                     | one status appearance, reduced-motion-aware                                                                                             | D17                           |
| table                       | records (phone labeled records), scroll, metrics; header/cell/row/empty/pagination slots                                                | D10 / D16                     |
| dialog                      | dialog, sheet, drawer, confirm, transcription, admin-confirm; panel/content/header/title/body/actions slots                             | D12 / D14                     |
| menu                        | popover, sheet, member, admin; original warm hover/check roles retained                                                                 | D13 / D10                     |
| toast                       | info/error; one recipe and separate placement role                                                                                      | D15                           |

Intentional aliases: menu popover/sheet/member (D13); dialog/confirm appearance (D14, different
roles); table scroll/metrics (D16); field ruled/transcription (D09/D10); toggle admin/presets
unselected items (D10, selected admin is underlined); tour danger=primary and quiet=secondary
(D17); dense primary/quiet=secondary (D10). These aliases are explicit in recipe comments and
covered by regression tests. Card accepts `as="article" | "section" | "div" | "aside"`.

No pending decision is treated as accepted. Keep role names in screens; changing the retained
appearance after a decision belongs to recipes/tokens rather than per-screen class rewrites.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run check:design-tokens`.
`tests/design-recipes.test.ts` checks all recipe variants/slots for property exclusivity and import boundaries;
`tests/design-primitives.test.ts` checks semantics, focus/inert/cancel policies, menus and notifier.

In development, `/dev/design-system` renders every adapter/variant side by side with the registry
switcher. Production eliminates the route and catalog. Run the exported page functions in
`scripts/browser-design-system.mjs` with the shared browser evaluator (or `page.evaluate` in a
browser harness): `verifyDesignSystemPage`, `verifyDesignSystemContexts`,
`verifyDesignSystemBehavior`, `verifyP3ReviewFixes` and, in an actual reduced-motion browser
context, `verifyP3ReducedMotion`. Inspect returned mismatches (must be empty). They compare tags, native state, attributes, roles, aria associations and all
computed properties and before/after pseudo-elements, exercise native focus behavior, and
mutate/restore one role to prove both adapters react to a token-only edit. The context check
neutralizes only the two host shells' layout dimensions; component appearance still competes
with the actual auth/admin legacy selectors. Evidence stays outside git under
`/tmp/aicap-design/evidence/p3-fix/` (review fixes) and `p3/` (original baseline).
