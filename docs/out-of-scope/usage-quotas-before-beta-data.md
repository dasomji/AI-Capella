# Usage Quotas Before Beta Data

[ADR 0008](../adr/0008-limits-follow-usage-data.md) and AICAP-31 reject guessed
allowances: invitation totals per organizer/ensemble, ensemble creation per day,
mutation rates, active jobs per person/ensemble, original storage, uploads per
person, admin usage date ranges, saved section/setting/percussion/reorder counts,
and audit-row budgets for rejected/denied requests.

Wrong guesses can interrupt rehearsal and are hard to diagnose. Revisit only with
beta usage evidence and owner consent. Protect against attacks and crashes now,
log protective hits, observe storage, and paginate history rather than hiding data.

Removed values, for recognizing accidental reintroduction: 50 invitations per
ensemble/day, 100 per organizer/day; 10 ensembles/person/day; 120 ordinary
mutations/person/minute and 20 admin management mutations/minute; 2 active
transcriptions/person and 4/ensemble; 5 GiB original storage/ensemble; 1 concurrent
upload/person; 366-day admin usage range; 1,000 sections, 1,024 setting keys,
256 percussion defaults and 10,000 reorder IDs. Rejected Origin audits previously
had a 20/minute budget; denied-request audit budgets were removed with those rows.
