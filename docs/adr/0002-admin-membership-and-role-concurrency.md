# Admin membership and platform-role concurrency

AICAP-26 extends the existing oversight surface with reasoned, audited management.

Membership mutations share the ensemble row lock used by ordinary lead actions.
The deferred last-lead trigger remains the final database invariant. Edits/removals
also compare the client's four permission booleans against the locked row; a stale
snapshot returns 409 rather than silently overwriting another administrator.
No version timestamp is needed for this permission-only comparison. Changing a
permission away and back is intentionally equivalent to the original snapshot.

Platform role writes, including the CLI, use one exclusive advisory transaction
lock. Other management mutations take a shared lock and recheck the actor's
verified role inside the transaction, so revocation cannot race an authorized
write past its role decision. Successful writes and their audit rows commit
atomically. Failed changes roll back to a savepoint before recording their outcome.
The server-side mutation rate counter is independent of that rollback.

Direct removal calls the extracted domain removal operation. Its caller commits
before publishing the same membership notification used by lead removal, preserving
socket, rehearsal and offline cache revocation behavior.

Sysadmins need not belong to every ensemble. Invitations therefore record an
`admin_issued` source bit and use the existing creator, delivery and acceptance
flow. Acceptance rechecks the issuer's current verified platform role. Revocation
also invalidates pending admin-issued invitations. Ordinary invitations retain
ensemble-scoped issuer checks. Invitations grant the existing capabilities;
leadership can be granted explicitly after joining, preserving the migration-only
lead invitation invariant. Raw invitation tokens remain exclusively in mail.

This is a deliberate exception to AICAP-6 ("grants must be authorized within this
ensemble"). The product owner accepted it on 2026-11-16: sysadmins administer the
whole of LightScore and may grant rights in any ensemble, as a member or not.

When an ordinary member manager resends an existing invitation, both its issuer
and its admin/ensemble authority source are preserved alongside the original
grants. A manager cannot convert the invitation's source or elevate its grants.
