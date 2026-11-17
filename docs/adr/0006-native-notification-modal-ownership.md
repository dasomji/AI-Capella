# Native Notification Modal Ownership

Status: Accepted for AICAP-28 (D12, D15).

## Context

Native `showModal()` provides background inertness and stacking. A notification popover attached
to body can remain visually above a modal while its buttons are still blocked by that modal's
inertness. The AICAP-28 browser click probe reproduced this: the dialog intercepted dismissal
of the new persistent error notification.

D15 also requires errors and actionable notices to remain until resolved. Replacing such a
notice with a later informational message would discard its unresolved action or error.

## Decision

Keep one notification host and move it into the active native dialog while that dialog owns
modality. The shared dialog stack publishes changes after opening and before screen-owned
close cleanup removes the dialog. On those changes the host follows the active dialog, or
returns to body when no modal remains. Its manual popover presentation retains the same
bottom-center placement. The native dialog lifecycle continues to own inertness and focus;
its Tab trap includes the notification's interactive controls.

Persistent notices queue subsequent messages until dismissal. Brief informational messages
continue to use the token-defined timeout. Notification buttons inherit the notification's
contrasting foreground, border and focus outline because the notification surface can invert
the ordinary page foreground.

## Consequences and verification

The host's parent is dynamic, while its ID and singleton identity remain stable. Toast-then-close
continues to work for controlled React disposal, DOM exit fades and stacked modals. Stack
subscriptions transport the host before the closing dialog is removed.

`tests/design-primitives.test.ts` covers persistence, queued actions, modal host ownership and
focus/stack lifecycle. `scripts/browser-overlays.mjs` uses real pointer dismissal inside an
active modal, checks the notification foreground, and verifies survival after modal removal.
The full adapter browser suite retains native keyboard, stacking, busy-cancel and reduced-motion
checks. Operational details and the public APIs are in
[the primitive guide](../agents/design-primitives.md).
