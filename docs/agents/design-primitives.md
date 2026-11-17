# Shared primitives

Recipes in `src/design-system/recipes` are pure TypeScript with literal `tw:` classes. React
and DOM adapters import the same functions. They have no runtime dependencies. `ds-reset` is
an opt-in slot reset above native CSS, including pseudo-elements; it is not global Preflight.
Tokens and the semantic Tailwind mapping remain in `tokens.css`. Custom Tailwind utilities
must be declared at the top level of `app.css`, outside its imported token layer.

## Use in React

```tsx
import { Button, Field, Input, Dialog, toast } from './design-system/react';

<Field label="Email" hint="Used for sign-in" error={error} variant="ruled">
  {association => <Input {...association} type="email" required
    value={email} onChange={event => setEmail(event.target.value)} />}
</Field>
<Button size="full-width" intent="primary" type="submit" busy={saving}>Save</Button>
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
  size: "full-width",
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
Switches default to command buttons; `mode="checkbox"` preserves a native input with switch semantics.
Use switches for immediately applied settings. Use `Checkbox` for choices submitted together with Save
or Invite; changing the visual control must never change when data saves. Switches and toggle groups are controlled: the owner updates
checked/value after the command succeeds. Use `createMenu(...).dispose()` when removing a menu.

Other exports: IconButton, Select, Textarea, Checkbox, Switch, Surface/Card, Badge, ToggleGroup,
Toolbar, Status, Loading, EmptyState, Sheet, ConfirmDialog, Menu, Toast and
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
a confirm above a dialog leaves the parent open, then returns focus into it. Scroll lock lasts
until the final modal closes. React Dialog portals to body, retains title/body ID associations,
and accepts native aria/data/id hooks. Confirm variants default to `role="alertdialog"`.

Always supply `behavior.opener` when available. Pointer capture also remembers the initiating
control for Safari, which may leave `activeElement` on body after a click. `onCancel(reason)` is
for user requests (`escape`, `outside`, `button`); `onClose` reports a completed close.
Controlled `open=false`, unmount and StrictMode replay dispose silently. Use `requestClose()`
for cancel buttons and `close()` after successful work. Policies: `escape`/`outside` =
`close | ignore`, `busyCancel` = `block | allow` (block by default). Explicit close always works.
D12 centers all dialogs except `transcription-review`, which stays full-screen. Historical
`Sheet` and its DOM builder remain centered aliases; the unused `Drawer` alias is retired; no swipe dismissal
or drag handle remains. Use `<Dialog variant="admin-detail" open={open} title={title}
behavior={{opener, busy}} onCancel={close}>…</Dialog>` for admin details. Its content scrolls
inside the viewport-bounded panel. `openDialog` measures `visualViewport` on resize/scroll,
retains safe-area margins and scrolls the focused field into view when a keyboard reduces the
visible area. The shared fade retains the native top layer through exit; reduced motion closes
immediately. Presentation stays fixed until close; the next opening uses the current layout.

`ConfirmDialog` / `createConfirmDialog` accept `destructive` and optional
`confirmAction: {label, onConfirm}`. The generated final action uses `intent="danger"` when
destructive; these wrappers always use `alertdialog`. Callers supplying custom `actions` must
set the final button's intent explicitly. Translated labels and asynchronous work remain owned
by the screen.
Menus support ArrowUp/Down, Home/End, Enter/Space, Escape and buffered typeahead. Space continues
a live typeahead buffer; otherwise it activates. Roving focus survives rerenders. React Menu
accepts a `trigger` and `placement="start" | "end"`, focuses the menu when opened, and returns
focus on Escape or selection. Omit trigger only for an intentionally static menu specimen.
Dispose DOM menus when removing them. Busy and disabled commands are guarded in both adapters.

`toast()` is the one lazy notifier across React and DOM; no host component is needed. Its single
host uses a manual popover in the top layer. It follows the active native modal so notification
buttons remain focusable, then returns to body before modal removal and survives toast-then-close. Text stays through
the token-defined exit fade. Placement is consistently bottom-center in every context. Brief
informational notices use `toast-duration-info`; errors persist with a translated dismissal
button. `toast(text, kind, {action: {label, onSelect}})` and `{persistent: true}` also stay until
dismissed. Subsequent notices queue behind persistent messages, so a success cannot erase an
unresolved error. Identical active/queued notices coalesce (including action callback identity); at
most ten distinct notices wait, with the oldest pending notice dropped on overflow. The active
message always remains. Phone placement uses the 150px bottom role to clear the player controls;
the host uses the token maximum width and viewport gutters, with wrapping message text. Errors use `role="alert"`, others `status`. Screen operation errors should
stay within the active panel; field errors use Field's adjacent error slot. Static `Toast` /
`createToast` consume the same appearance recipe; host geometry uses `toastPlacementRecipe`.

Compact member/scan-job menus stay anchored popovers at every width (D13). `bindRowMenu(details,
menu.element)` preserves the native disclosure and keyboard contract, uses the popover top layer
to avoid clipping, and disposes placement/listeners with the owning screen. `anchorPopover` tracks
resize, captured scrolling, visual viewport and element resizing; collision handling bounds the
panel and provides inner scrolling. Main library/player menus use centered dialogs.
`src/ui.ts` retains only `closeOverlay`, `isNarrow` and the domain `MenuItem` type.
`dom/legacy.ts` documents these signatures; no legacy visual constructors remain. Stable
class/query hooks remain for event delegation, tours and renderer measurement. Native controls keep inherited color-scheme, visibility,
pointer-events, accent-color and print-color-adjust despite the opt-in reset.

## Screen implementation rules

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
   Give dialogs an opener; confirm dialogs may stack above other dialogs. Never add manual inert
   observers. Toast-then-close is supported.
6. Use independent intent and size choices for ordinary actions. Named domain composition slots
   preserve behavior hooks; they do not introduce another ordinary button family.
7. Verify keyboard focus, actual Tab wrap/return, nested stacking, native dark controls, menu
   rerenders, toast-then-close and closing transitions in a real browser for every screen slice.
   Attribute/ARIA parity and computed-style parity are complementary checks.

## Decided controls (AICAP-28)

| Primitive | Choices and behavior |
| --- | --- |
| Button | `standard` ordinary family; `primary`, `secondary`, `quiet`, `danger` intents; `size="standard"`, `compact`, `full-width`, `touch` |
| IconButton | Explicit `size="standard"`, `compact`, `touch`; named glyph/domain variants retain their semantics |
| Field/Input/Select/Textarea | Default `ruled` writing line; boxed exceptions `search`, `numeric`, `repeated-name`; domain/account variants retain layout and association hooks |
| Checkbox | `standard`, `permission`, `export`, `export-voice`; use for submitted choices |
| Switch | Use for immediate settings, including shared-device policy and member capabilities; invitation permissions use checkboxes |
| Field/Checkbox/Switch | `density="standard"`, `compact`, `touch`; Field density is inherited by its native React control |
| EmptyState | `standard`, `compact`, `jobs-hidden`; supply a useful next action when available; irrelevant scan work stays hidden |
| Loading/Status | Related readable inline layouts; distinguish loading from empty and error; use explicit feedback intent |
| Tour/power hint | Ordinary paper surface and ink; tour spotlight and keyboard behavior remain |

Standard actions are at least 44×44. Compact actions use the authored desktop roles and expand
at `tw:touch:` (phones/tablets up to the panel breakpoint and any device with a coarse pointer).
Specialized music controls retain their shape; their composition owns the surrounding hit area.
Informational badges are passive labels, with shared intent colors and readable text.

Retired ordinary Button variants: `cta` → `size="full-width"`; `pill`, `tour`, `job-action` →
standard; `dense`, `compact` → `size="compact"`; `dense-sort`, `link`, `tour-link`, `hint-link`,
`transcription-link` → quiet compact; `hint` → secondary; `account-delete-confirm` → danger.
Generic `boxed` fields are retired in favor of the three purpose variants above.
`landing-actions`/`library-text` empty states become `standard`; `admin-text` becomes `compact`.

Field errors follow their controls and participate in `aria-describedby`/`aria-invalid`.
`updateField` preserves the focused input. Operation errors belong inside the active panel and
stay until resolved. Irreversible confirmations use `destructive` on ConfirmDialog plus a danger
final action; `confirmAction` can build that action. Caller-supplied actions remain responsible
for their intent. See [the design-system guide](design-system.md) for overlay, theme and support decisions.

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
computed presentation properties and before/after pseudo-elements, exercise native focus behavior, and
mutate/restore one role to prove both adapters react to a token-only edit. Custom-property
maps are checked by the theme contracts rather than repeatedly compared on every specimen. The context check
neutralizes only the two host shells' layout dimensions; component appearance still competes
with the actual auth/admin composition recipes. Run `npm run test:browser:design-system`;
set `BROWSER_EVIDENCE` for captures outside git.
`npm run test:browser:components` additionally exercises real ensemble forms with stubbed APIs:
immediate member saves, invitation choices submitted together, a persistent panel failure and
successful retry, and a final destructive confirmation across both supported themes and four viewports.

### Library parity

`library-open` / `library-more`, `landing-mode`, `landing-link` / `landing-aside` /
`landing-create`, `library-action`, `paper-choice`, `sound-prompt` and `offline-update`
retain the main screen's authored controls. Fields add `library-search` and `library-prompt`;
Card/Badge add `library`; overlays add `library-prompt`, `library-sheet` and `library-popover`;
Menu adds `library`. Their material and responsive slots live in `recipes/library.ts` and read `tokens.css`;
`library.css` contains generated spotlight residue only. `createLibraryPart` owns typed composition slots;
`updateLibraryBanner` retains its hooks during state changes. These names preserve parity,
including the parchment phone menu-button ground. Library waiting and empty content now use the shared Loading/EmptyState family.

DOM Menu items may supply an icon Node, radio semantics and nested `options` with a current
`value`. Labels remain text, disabled commands stay guarded, and the menu owner disposes the
binding on close. Popovers share native modal focus and fade transport.

Library prompts, main menus and settings panels now share centered geometry and fade through
`openDialog`. Their legacy variant names retain stable hooks only; they no longer select
sheets, floating popovers or swiping. Focus, scroll lock and Escape/busy policies remain shared.

### Account/ensemble/offline parity

`ensemble-switch` / `ensemble-other`, `device-link` and `account-delete-confirm` keep the
navigation and deletion action appearances. The final deletion command uses the shared danger intent and destructive confirmation treatment (D14). `shared-device` is a native checkbox appearance of Switch:
use `mode:"checkbox"` and `updateSwitch`; its 24-hour policy remains in offline-store.ts.
`account-password` supplies the ruled password field. `createAccountPart` owns account body,
email, note, heading and Administration-link composition; `Status`'s `account-delete` variant
puts the error at its existing position below the password, with the shared danger role.
The old account-error class had no matching error styling outside the auth shell.
`Badge`'s `offline-prepared` variant retains prepared marks; card availability is the named
`data-offline-unavailable` state. Offline identity, membership, expiry and purge gates stay
in their existing storage/library modules.

Update builder controls with `updateButton`. When screen code changes a native attribute
also present in the builder's initial `attrs` (for example transcription entry `hidden`),
pass its current value in the update so initial construction state is not reapplied.

### Player toolbar and mixer parity

`createVoiceRow`, `createVoiceChip` and `createMixerVolume` compose native controls from shared
Button/IconButton/Input primitives. Player slots and Transport recipes own header, footer,
mode/view groups and zoom chrome. `player-*` button appearances retain stop-left/stop-mid,
phone/short-landscape sizing, the pearl/embossed play material, mix/name/chip states and reset.
`player-volume` is the native ducking range; its min/max/step and input event remain screen-owned.
`player-preference` Switch retains the historical track/thumb and delegates commands to main.ts.
Update pressed/playing state using `updateButton`, and checked state using `updateSwitch`.
Voice colors arrive through `colorForPart` from the theme snapshot and set only `--c`.
`createPlayerGlyph` builds trusted SMuFL text Nodes for the shared native player/voice menus.
The unprefixed class hooks remain for delegation, introduction targets and state queries;
`player.css` owns appearance. Numeric, SectionMark, export and utility compositions are described below.

Per-voice CSS expressions must resolve at the row/chip that owns `--c`. A compound custom
property declared on `:root` resolves there, so a root material containing `var(--c)` loses
its later row value. Keep `color-mix`/gradient/shadow expressions at the recipe consumer and
reference shared pigment/material inputs from tokens; only the voice assignment is dynamic.
Player global shortcuts ignore open native dialogs as well as retained legacy overlays,
preserving the previous modal command boundary. Do not copy an initial `aria-pressed` into
builder `attrs`: pass `pressed`, then update it through `updateButton`. Play labels update
through the same state API so construction-time attributes cannot restore an old label.

### Numeric, sections, export and utility parity

`createMainScreen` builds the main domain shell directly from shared controls, with translated
text/icon callbacks and the existing canvas/layout hooks. No legacy-control template pass is
needed. `createPanelPart` names numeric, export, scan-mark, offset and diagnostic slots;
`createSectionMark` composes the printed mark from Button (`section-mark` / `section-word`).
`panel-step`, `panel-tempo`, `panel-round`, `panel-preset` retain footer/sheet numeric variants.
Fields use `panel-tempo`, `panel-measure`, `panel-export` and `panel-offset`; `export-voice`
Checkbox retains its 20px native size, margins and per-voice accent, distinct from the existing
18px `export` variant. Export options remain a native details/summary disclosure.

Use updateButton for preset, busy/native-disabled and readiness changes. Offset range min/max,
step, units, persistence and events stay screen-owned; its track/thumb appearance now belongs
to panels.css. No global legacy range selector remains. Panels retain native paragraph/range
margins and list-marker behavior through their opt-in reset. Native menus/prompts/sheets use
the shared lifecycle; supply stable openers and dispose menus. The existing PDF-only export
and automatic A/B/C section relabeling are unchanged; no new export format or rename command
is introduced by this presentation migration.

## Final shell boundary

`recipes/shell.ts` owns auth layout, library/landing chrome, ensemble content, tour/power content
and transcription layout. Owning constructors call `shellRecipe` with stable hooks; controls
continue to use their typed primitive recipes. ID/class names are behavior hooks, not another
palette. CSS residue is limited to native/generated parts, global inheritance, renderer sizing
and animation definitions, each with an adjacent reason.

Add a theme through one complete token block and one registry entry. Run
`npm run test:browser:theme-extension` for the non-shipped fourth-theme proof.


## Applied responsive and integration decisions

**D06.** Administration uses the same LightScore paper, accent, typography and shared controls in a deliberately compact work layout. Its former independent palette is retired; admin detail-page presentation remains pending owner confirmation.

**D12 B.** Settings, prompts and main menus use centered native dialogs with safe viewport margins and a shared fade; transcription score review alone remains full-screen. Historical Sheet names are centered compatibility aliases; drag handles and swipe/slide behavior are retired. The desktop main-menu placement question remains pending owner approval.

**D13 B.** Compact member and transcription-job row menus remain anchored popovers at every width, including phones. Shared placement bounds their geometry and keeps long menus internally scrollable; main menus retain the D12 dialog transport.

**D16.** People and membership tables use labeled records below the account breakpoint. Comparison and metric tables retain contained horizontal scrolling, while administration navigation scrolls horizontally. These table/navigation choices do not settle the pending admin detail-page presentation.

**D23.** The tablet library uses fixed 280px comfortable card columns between the compact and transport breakpoints, showing fewer, wider covers instead of squeezing extra columns. Below the compact breakpoint the existing single-column phone records remain.

**D24.** An open menu retains its chosen presentation and DOM identity through rotation. Shared viewport handling re-bounds and scrolls its contents; presentation is chosen again only for a later opening.

**D25.** At narrow panel widths, score review switches between score and original with one toggle above the panes. Wide layouts retain the side-by-side comparison switch; narrow layouts show only the selected pane and keep the return control reachable.

**D26 interim.** Until room permissions are designed separately, the EN/DE introduction describes the current Together behavior: everyone controls shared playback on every device; volume, mute and solo remain personal. It promises no missing “take the lead” command and introduces no new session permissions.

**D21 pending owner approval.** An extended voice palette requires owner approval against the current colors before implementation. Existing voice colors, labels and renderer identification cues remain; this round makes no palette change.
