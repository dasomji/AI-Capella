import type { PlaybackState } from './sync';
export interface PlaybackTransport {
 subscribe(listener: (state: PlaybackState | null) => void): () => void;
 publish(patch: Partial<PlaybackState>): Promise<void>;
}
/** Phase 3 provides the authenticated Socket.IO transport. */
let state:PlaybackState|null=null;
const listeners=new Set<(state:PlaybackState|null)=>void>();
export const localPlayback: PlaybackTransport = {
 subscribe(listener) {listeners.add(listener);listener(state);return ()=>{listeners.delete(listener);};},
 async publish(patch) {state={...state,...patch} as PlaybackState;listeners.forEach(listener=>listener(state));},
};
