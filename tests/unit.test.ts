import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMusicXML } from '../src/musicxml';
import { parseMIDI } from '../src/midi';
describe('preserved musical import boundaries', () => {
 it('loads the bundled MusicXML with voices and timed notes', () => {
  const score = parseMusicXML(readFileSync('public/evening-rise.musicxml', 'utf8'));
  expect(score.parts.length).toBeGreaterThan(1);
  expect(score.notes.length).toBeGreaterThan(20);
 });
 it('rejects non-MIDI content', () => { expect(() => parseMIDI(new ArrayBuffer(20))).toThrow(); });
});

it('keeps imported source and independent part edits in the local library', async () => {
 const { saveImportedSong, updateSongMetadata, deleteImportedSong } = await import('../src/library');
 const { localLibrary } = await import('../src/local-library');
 const xml = readFileSync('public/evening-rise.musicxml','utf8');
 const id = await saveImportedSong({ title:'Local rehearsal',xml,format:'musicxml' });
 await updateSongMetadata(id,{partName:{partId:'soprano',name:'Soprano'}});
 await updateSongMetadata(id,{partName:{partId:'bass',name:'Bass'}});
 expect(localLibrary.get(id)?.xml).toBe(xml);
 expect(localLibrary.get(id)?.partNameOverrides).toEqual({soprano:'Soprano',bass:'Bass'});
 await deleteImportedSong(id); expect(localLibrary.get(id)).toBeUndefined();
});
