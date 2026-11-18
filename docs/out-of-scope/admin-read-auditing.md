# Admin Read Auditing

Rejected approach: write an in-app audit row for each collection read, detail
view, content/download access or original page preview, and throttle normal
admin reads by actor.

Daniel's direction: the audit is for changes; debugging belongs in Grafana.
Read rows obscure useful mutation history and add database work. List throttles
interfere with normal pagination/search and do not replace bounded server pages.

The implementation removes future read audits and admin read-rate limits without
removing existing historical audit rows. Content/download reasons and caps remain;
structured operational stdout records access reasons and cap hits. Non-admin
limits and atomic mutation auditing remain unchanged.

See [ADR 0007 (Proposed)](../adr/0007-admin-audit-scope-and-read-limits.md) and
[ADR 0002](../adr/0002-admin-membership-and-role-concurrency.md).
