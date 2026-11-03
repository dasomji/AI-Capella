# AICAP-9: Preserve playback timing across latency, tempo changes, reconnect and mobile sleep

Outcome

Socket transport preserves the current locally generated audio and scheduled shared timeline without stale-command replay or accidental time jumps.

Acceptance criteria

Calibrate server-clock offset with multiple timed requests; keep lowest-RTT estimation, periodic refresh and wake/visibility recalibration. Define behavior when clock calibration is unavailable or uncertainty is too high.

Schedule accepted changes sufficiently in the future; preserve play/count-in/starting tones, seek, loop anchors, output-latency compensation and late-join elapsed position.

Tempo/transposition updates preserve the musical position at their effective timestamp instead of sampling a beat now and restarting that beat after the lead-in delay. Verify this suspected current behavior with a deterministic regression test.

Reconnect fetches latest authorized snapshot/revision before controls resume; reject stale revisions and locally buffered commands. Resume at current position, skipping past pre-roll.

Define natural end-of-song canonical state and safe server restart behavior; avoid leaving sessions permanently playing after every client has locally stopped.

Controlled tests cover skew/jitter, asymmetric delays, long disconnect, suspended AudioContext, mobile sleep, multiple tabs, loop wraparound and account/ensemble switching. Record actual timing tolerance; do not promise sample-accurate sync across arbitrary output hardware.

Evidence

src/sync.ts:7-11 (750ms lead), :113-168 (clock calibration/failure). src/audioEngine.ts:736-798 (late join/resume), :1082-1085 (output latency). main.ts:2493 (tempo beat capture), :3389-3395 (local end), :3398-3449 (loop/timeline recovery).

Dependencies

Socket authoritative protocol and a testable rehearsal controller.
