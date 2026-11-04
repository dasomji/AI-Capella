// Solo playback compatibility model. Together uses rehearsal/ exclusively.
import { randomId } from './uuid';
import type { LoopRegion } from './pianoRoll';
export interface PlaybackState {
  songId: string | null;
  playing: boolean;
  originBeat: number;
  originServerTimeMs: number;
  bpm: number;
  transpose: number;
  metronomeOn: boolean;
  loopEnabled: boolean;
  loopRegion: LoopRegion | null;
  countInBeats: number;
  countInPulseBeats: number;
  freshStart: boolean;
  startTonesOn: boolean;
  startTones: number[];
  leaderId: string | null;
}

export function getDeviceId(): string {
  const key = 'ai-capella-device-id';
  let id = localStorage.getItem(key);
  if (!id) { id = randomId(); localStorage.setItem(key, id); }
  return id;
}
export const getServerTimeOffsetMs = () => 0;
export const computeFutureOriginServerTimeMs = (extraLeadMs = 0) => Date.now() + 750 + extraLeadMs;
