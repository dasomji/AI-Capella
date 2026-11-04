# AICAP-21: Later: user-created playback rooms with selectable and delegated control

Future feature; not required for the initial refactor release

Initially every current ensemble member can control the ensemble's shared synchronized playback. Later allow members to create independent synchronized playback rooms within an ensemble.

Acceptance criteria

- On room creation the creator chooses whether everyone in the room may control playback or only the creator may control it.

- The creator may grant and revoke room-control rights for other participants. In restricted mode the authorized controller set is the creator plus specifically granted people.

- Room control permissions are distinct from ensemble member management, music piece editing and AI transcription permissions. They do not grant ensemble administration or access to another ensemble.

- Authorize joining and controlling rooms server-side against current membership and room policy; apply revocation to existing connections.

- Each room has an isolated canonical playback state, revision sequence, clock/timing behavior and reconnect snapshot. Commands in one room cannot affect another.

- Define creator departure/account deletion, room lifetime and active-room switching behavior before implementation; do not infer that these are already settled.

- Test everyone-control mode, restricted mode, grants/revocations, nonmember denial, simultaneous commands and isolation.

Dependencies

AICAP-5 ensemble permissions, AICAP-8 authoritative Socket.IO protocol, AICAP-9 timing. Preserve the simple all-members-control initial release; do not gate it on this feature.
