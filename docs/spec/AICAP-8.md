# AICAP-8: Replace Firestore playback patches with an authoritative Socket.IO command protocol

Outcome

A backend accepts authorized rehearsal commands, persists a canonical versioned state per ensemble and broadcasts it to all authorized devices, including the sender.

Acceptance criteria

Validate typed play/pause/stop/seek/tempo/transpose/loop/song/count-in/start-tone commands; authorize transport room joins and each command using current ensemble membership. All current members may control playback in the initial version; no exclusive conductor role or music-piece edit permission is required.

Serialize accepted state changes per ensemble; assign monotonic revisions, command IDs and server-chosen effective/start times. Reject duplicates, expired/stale commands and incompatible prior revisions with actionable acknowledgements.

Persist and broadcast accepted state without losing notifications silently; reconnect reads canonical snapshot. Latest durable state survives server restart.

Maintain a complete state contract so stale omitted count-in/start-tone fields cannot reattach through merge semantics.

Distinguish user, browser device and tab/connection; do not gate controls on acquiring or taking over a conductor role. Serialize competing commands from any current member through the same authoritative revision protocol. Session/member revocation removes existing transport room/control access.

Local mute/solo/true-solo stays device-local. Reject direct forged socket commands even if UI buttons are bypassed.

Initial scope can use one persistent server. Document ordering/fanout requirements before adding replicas; no Redis dependency is required solely for this first implementation.

Evidence

src/sync.ts:223-225 blindly merges client patches; :182-183 lets publisher choose time; :36-55 documents stale pre-roll fields. main.ts:1645-1685 enforces follower lock only in UI. firestore.rules:135-137 permits every member to write session.

Dependencies

Authenticated backend, dynamic ensemble permissions and durable session schema; pair with clock/reconnect and integration-test tickets.

Scope

Socket.IO transport rooms group authorized connections; user-created playback rooms are a separate later feature. Initially preserve one shared synchronized session per ensemble. Future room control policies must not be implemented as an initial release requirement.
