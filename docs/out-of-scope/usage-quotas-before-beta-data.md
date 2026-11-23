# Usage Quotas Before Beta Data

[ADR 0008](../adr/0008-limits-follow-usage-data.md) and AICAP-31 reject guessed
allowances: invitation totals per organizer/ensemble, ensemble creation per day,
mutation rates, active jobs per person/ensemble, original storage, uploads per
person, admin usage date ranges, saved section/setting/percussion/reorder counts,
and audit-row budgets for rejected/denied requests.

Wrong guesses can interrupt rehearsal and are hard to diagnose. Revisit only with
beta usage evidence and owner consent. Protect against attacks and crashes now,
log protective hits, observe storage, and paginate history rather than hiding data.
