# AICAP-7: Preserve offline rehearsal and prevent private API data entering shared service-worker caches

Observed migration risk

public/sw.js:60-95 caches all successful same-origin GETs; Firebase was excluded because it was cross-origin (:64). A same-origin API would make auth/session, invitation, ensemble and Socket.IO polling responses eligible for shared cache storage.

Acceptance criteria

Change worker to an explicit static-asset allowlist; bypass auth/API/invitation/realtime routes and purge old caches on rollout. Private session/API responses never enter shared Cache Storage.

Replace Firestore offline persistence with account + ensemble + content-version scoped IndexedDB storage. Downloaded scores, metadata, settings and piano samples work after offline reload.

Define offline repertoire download/eviction and queued-edit policy; display cached/offline/pending/conflict state. Preserve existing useful rehearsal access rather than relying on browser memory alone.

Logout and account switching clear sensitive in-memory/private cached context; membership revocation applies once learned online. Document that disconnected downloaded data cannot be remotely erased instantly.

Never buffer/replay playback, seek or leadership commands. Any supported queued metadata edits require versions/conflict handling and fresh permission checks on replay.

Test shared-tablet user A logout/user B login, ensemble switching, multiple tabs, offline reload, expired session and reconnect.

Evidence

src/firebase.ts:13-24 supplies 200 MB persistent multi-tab cache and offline write replay. src/library.ts:111-123 surfaces cache status. public/sw.js:1-8 says songs are not stored by worker. main.ts:3727-3766,3823-3828 integrates offline loading.

Dependencies

Account/ensemble identity and versioned repository contracts. Static-worker exclusions must land before serving authenticated APIs on the app origin.
