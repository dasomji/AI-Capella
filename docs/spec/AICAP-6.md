# AICAP-6: Add ensemble email invitations through Resend with expiry, revocation and safe acceptance

Outcome

Ensemble owners/authorized administrators invite people by email through the application using Resend.

Acceptance criteria

Invitation records contain ensemble, intended email, permitted role, inviter, expiry and lifecycle state. Configure Better Auth organization invitations or equivalent shared membership flow without duplicate membership sources of truth.

Create/send/cancel/resend actions are authenticated, permission checked and rate limited; Resend key remains server-only. Planning this ticket sends no actual emails.

Acceptance requires a verified account matching the intended email, adds membership transactionally and is idempotent; expired/revoked/replayed links and wrong-account acceptance fail clearly.

Repeated requests do not create duplicate memberships or uncontrolled email sends; use provider idempotency and a reliable retry/outbox strategy with visible delivery failure state.

Invite page survives sign-in/verification and returns to the intended ensemble; admin can inspect pending invites, cancel and resend them. Member management supports removal independent of changing reusable codes.

User-facing invitation/auth/ensemble flows have English and German strings consistent with existing i18n.

Evidence

src/ensembles.ts:206-227,249-291 currently implements reusable member/leader codes; no email invitation system exists. firestore.rules:94-104 has no administrator removal flow for another member.

Dependencies

Backend secret boundary, Better Auth and dynamic ensemble permission model. Sender domain/configuration are implementation setup requirements, not credentials to store in tickets.

Confirmed invitation flow (2026-11-03)

The ensemble lead and members granted ensemble member-management permission may invite people through Resend. Invitees sign in or create an email/password account, verify the intended email, and accept the invitation. Ordinary membership grants no music piece create/update/delete permission. Any invitation permission grants must be authorized within this ensemble; no invitation may grant platform sysadmin.
