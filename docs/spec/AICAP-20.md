# AICAP-20: Add a sysadmin interface for oversight of users, ensembles and music pieces

Outcome

Provide a platform sysadmin interface with an overview of all users, ensembles and music pieces, separate from ensemble administration.

Acceptance criteria

- Provide paginated/searchable user, ensemble and music piece lists and detail views; show memberships, ensemble leads, assigned ensemble capabilities, piece ownership and relevant account/content status.

- Permit cross-ensemble oversight only to an explicitly provisioned platform sysadmin. An ensemble lead or member manager is never a platform sysadmin by implication.

- Protect every admin route, server function and underlying query server-side. Guessing routes/IDs, calling APIs directly, changing request roles or granting ensemble permissions must not bypass authorization.

- Provision/bootstrap initial sysadmin through a documented controlled process; never make the first self-registering user a sysadmin. New accounts and invitation acceptance cannot self-elevate.

- Oversight is the requested initial scope. Do not implicitly add impersonation, password/token disclosure, unrestricted exports or global destructive controls. Any later management actions require explicit operation-specific design.

- Return only necessary account/content data; never expose credentials, session tokens, password hashes, provider keys or unrestricted object-store access.

- Record sysadmin access to private detail/content and any subsequently authorized mutations with actor, target, action, outcome and instant, without logging private score bodies or secrets.

- Store audit instants as PostgreSQL timestamptz through Drizzle withTimezone timestamps; logs use UTC. Centralize UI time formatting with an explicit project/user IANA zone and accept only offset-qualified API timestamps. Business/display-zone choice remains open.

- Test ordinary-member and ensemble-lead denial, explicit sysadmin access, revocation and no privilege escalation; test date formatting near midnight/DST under a non-UTC process zone.

Dependencies

Better Auth accounts (AICAP-4), ensemble permissions (AICAP-5), music piece schema (AICAP-3), private object storage. Keep this interface in the new fork so the legacy application is unaffected.
