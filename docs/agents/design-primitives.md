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
  {association => <Input {...association} variant="ruled" type="email" required
    value={email} onChange={event => setEmail(event.target.value)} />}
</Field>
<Button variant="cta" intent="primary" type="submit" busy={saving}>Save</Button>
<Dialog open={open} title="Rename" onClose={() => setOpen(false)}
  behavior={{ busy: saving, busyCancel: 'block', outside: 'ignore' }}>
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
import { createButton, createInput, createField, createSheet, toast } from './design-system/dom';

const input = createInput({ variant: 'ruled', type: 'email', required: true,
  attrs: { 'data-bind': 'email', autocomplete: 'email' } });
const field = createField({ label: 'Email', control: input, variant: 'ruled', error });
const save = createButton({ text: 'Save', variant: 'cta', intent: 'primary', busy: saving,
  attrs: { 'data-action': 'save' }, onClick: saveEmail });
const sheet = createSheet({ title: 'Account', content: field, actions: save,
  behavior: { busyCancel: 'block', onClose: () => cleanup() } });
sheet.open();
sheet.setBusy(true); // cancellation is blocked; explicit sheet.close() completes the work
```

Builders use `textContent`. DOM native attributes go through `attrs`; class/style/event-string
attributes are rejected. Add event listeners normally. `updateButton` and `updateSwitch` change recipe/state in
place and retains existing IDs/data hooks. Both button adapters default to `type=button`.
Busy uses guarded `aria-disabled`, preserving focus; actual `disabled` remains native.
Switches default to command buttons; `mode="checkbox"` / `{mode:'checkbox', name:'permission'}`
preserves native form semantics. Switches and toggle groups are controlled: the owner updates
checked/value after the command succeeds. Use `createMenu(...).dispose()` when removing a menu.

Other exports: IconButton, Select, Textarea, Checkbox, Switch, Surface/Card, Badge, ToggleGroup,
Toolbar, Status, Loading, EmptyState, Sheet, Drawer, ConfirmDialog, Menu, Toast/ToastHost and
Table/TableWrap/TableHeader/TableCell/TableRow/TableEmpty/TablePagination. DOM equivalents use
`create*`; overlays return `{element, open, close, setBusy}` and menus `{element, dispose}`.
Table cells accept native attributes including `data-label` (phone record labels) and React
`colSpan`/`scope`. Domain fetching, validation, permissions, sorting and translations stay with
screens. These components do not introduce tabs semantics for URL navigation or mode switches.

## Behavior and compatibility

`behavior/openDialog` is the only native modal lifecycle. It owns initial focus, Tab wrapping,
background inert restoration (including later body children), scroll lock, native close cleanup,
focus return and one-open-overlay replacement. Policies: `escape`/`outside` = `close | ignore`;
`busyCancel` = `block | allow` (block by default). Explicit `close()` always works. Sheets contain
scrolling; motion utilities honor reduced motion. React closes/disposes on unmount. Menus support
ArrowUp/Down, Home/End, Enter/Space, Escape and buffered typeahead, skipping disabled/hidden items.

`toast` is one notifier/host across React and DOM. `ToastHost` subscribes client-side without
creating another host; import and SSR are safe. Latest message replaces the previous one,
with 3200ms info / 6500ms error timing. The host moves into an open dialog so announcements stay
in its accessible subtree. Plain `Toast` / `createToast` render the same static appearance.

`src/ui.ts` re-exports compatibility compositions in `dom/legacy.ts`, preserving existing
signatures and CSS/query hooks. Those compositions use the shared modal/menu/notifier behavior.
Their legacy class appearances, including `toastRecipe({variant:'legacy'})`, deliberately remain
on legacy CSS until P4/P5 adopt primitives. The new slot reset must never be attached to that
compatibility toast; a regression test and screen parity capture enforce this boundary. No
screen migration or legacy stylesheet deletion belongs to P3.

## Pending owner choices and named parity variants

| Recipe | Named appearances | Pending decision |
| --- | --- | --- |
| button | standard (42px, radius 12), cta (full width, 44px), pill (44px, round), tour (inverted, 38px), dense (44px, radius 3, admin mono), link | D08; dense/link D10; tour D17 |
| button intent | secondary, primary, danger, quiet; admin danger remains outlined | D08 / D14 |
| icon-button | standard (40), small (32), transcription (40), admin-close (40), admin-copy (32) | D08 / D10 |
| field/input/select/textarea | boxed, ruled (account), domain, transcription, admin; label/control/hint/error slots | D09 / D10 |
| checkbox | standard, permission (20), export (18) | D11 / D10 |
| switch | player (52×32), admin (48×26), capability (28×16); button or native checkbox semantics | D11 / D10 |
| surface/card | surface, raised, material, admin, tour (inverted) | D12 / D10 / D17 |
| badge/status | neutral, success, warning, error, accent | D15 |
| toggle-group | segmented, language, transcription, admin, presets | D10 / D11 |
| toolbar | one wrapping appearance; screen owns contents | D10 |
| empty-state | landing-actions, library-text, admin-text, jobs-hidden | D17 |
| loading | one status appearance, reduced-motion-aware | D17 |
| table | records (phone labeled records), scroll, metrics; header/cell/row/empty/pagination slots | D10 / D16 |
| dialog | dialog, sheet, drawer, confirm, transcription, admin-confirm; panel/content/header/title/body/actions slots | D12 / D14 |
| menu | popover, sheet, member, admin; original warm hover/check roles retained | D13 / D10 |
| toast | info/error; legacy compatibility hook during migration | D15 |

No pending decision is treated as accepted. Keep role names in screens; changing the retained
appearance after a decision belongs to recipes/tokens rather than per-screen class rewrites.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, `npm run check:design-tokens`.
`tests/design-recipes.test.ts` checks exclusivity/import boundaries and the legacy reset boundary;
`tests/design-primitives.test.ts` checks semantics, focus/inert/cancel policies, menus and notifier.

In development, `/dev/design-system` renders every adapter/variant side by side with the registry
switcher. Production eliminates the route and catalog. Run the exported page functions in
`scripts/browser-design-system.mjs` with the shared browser evaluator (or `page.evaluate` in a
browser harness): `verifyDesignSystemPage`, `verifyDesignSystemContexts`,
`verifyDesignSystemBehavior`. Inspect returned mismatches (must be empty). They compare all
computed properties and before/after pseudo-elements, exercise native focus behavior, and
mutate/restore one role to prove both adapters react to a token-only edit. The context check
neutralizes only the two host shells' layout dimensions; component appearance still competes
with the actual auth/admin legacy selectors. Evidence stays outside git under
`/tmp/aicap-design/evidence/p3/`.
