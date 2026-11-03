import type { StoredSong, SongFormat } from './library';
export interface LibraryRepository {
 subscribe(listener: (songs: StoredSong[]) => void): () => void;
 get(id: string): StoredSong | undefined;
 update(id: string, patch: Partial<StoredSong>): Promise<void>;
 remove(id: string): Promise<void>;
 add(song: { title: string; xml: string; format: SongFormat }): Promise<string>;
}
// Intentionally ephemeral: Phase 2 supplies an authenticated server repository.
class LocalLibrary implements LibraryRepository {
 private songs: StoredSong[] = [];
 private listeners = new Set<(songs: StoredSong[]) => void>();
 subscribe(listener: (songs: StoredSong[]) => void) { this.listeners.add(listener); listener(this.songs); return () => { this.listeners.delete(listener); }; }
 get(id: string) { return this.songs.find(song => song.id === id); }
 async update(id: string, patch: Partial<StoredSong>) { this.songs = this.songs.map(song => song.id === id ? { ...song, ...patch } : song); this.listeners.forEach(listener => listener(this.songs)); }
 async remove(id: string) { this.songs = this.songs.filter(song => song.id !== id); this.listeners.forEach(listener => listener(this.songs)); }
 async add(song: { title: string; xml: string; format: SongFormat }) {
   const id = crypto.randomUUID(); this.songs.push({ ...song, id, importedAt: Date.now() });
   this.listeners.forEach(listener => listener(this.songs)); return id;
 }
}
export const localLibrary: LibraryRepository = new LocalLibrary();
