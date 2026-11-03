import type { PlaybackState } from './sync';
export interface PlaybackTransport {
 subscribe(listener: (state: PlaybackState | null) => void): () => void;
 publish(patch: Partial<PlaybackState>): Promise<void>;
}
/** Phase 3 provides the authenticated Socket.IO transport. */
export const localPlayback: PlaybackTransport = {
 subscribe(listener) { listener(null); return () => {}; },
 async publish() { /* Solo playback remains inside the existing audio controller. */ },
};
