// @vitest-environment node
import { test,expect } from 'vitest';
import { compareMusicXML } from '../server/reference-comparison';
const part=(id:string,step='C',number='1')=>`<part id="${id}"><measure number="${number}"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><lyric><syllabic>single</syllabic><text>la</text></lyric></note><note><rest/><duration>6</duration></note></measure></part>`;
const score=(parts:string[])=>`<score-partwise><part-list><score-part id="S"><part-name>Soprano</part-name></score-part><score-part id="B"><part-name>Bass</part-name></score-part></part-list>${parts.join('')}</score-partwise>`;
test('ignores part ordering and printed measure numbers',()=>{const r=compareMusicXML(score([part('B'),part('S','C','99')]),score([part('S'),part('B')]));expect(r.metrics.notes.f1).toBe(1);expect(r.reviewEffort.measuresNeedingEdits).toBe(0);expect(r.qualityPass).toBeNull();});
test('valid XML with wrong pitch is not musical accuracy',()=>{const r=compareMusicXML(score([part('S','D')]),score([part('S')]));expect(r.metrics.notes.f1).toBe(.5);expect(r.metrics.pitch.f1).toBe(.5);expect(r.metrics.lyrics.f1).toBe(1);expect(r.metrics.ties.f1).toBe(0);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);});
test('missing measures, rests, lyrics and attributes lower recall',()=>{const ref=score([part('S'),part('B')]);const r=compareMusicXML(score([part('S').replace('<text>la</text>','<text>no</text>').replace('<duration>6</duration>','<duration>4</duration>')]),ref);expect(r.metrics.measures.recall).toBe(.5);expect(r.metrics.rests.f1).toBe(0);expect(r.metrics.duration.f1).toBeLessThan(1);expect(r.metrics.lyrics.f1).toBe(0);expect(r.metrics.key.recall).toBe(.5);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);expect(r.reviewEffort.partMeasuresNeedingEdits).toBe(2);});
test('normalizes divisions and rejects unsafe or malformed input',()=>{const xml=score([part('S')]);expect(compareMusicXML(xml.replace('<divisions>2','<divisions>4').replace('<duration>2','<duration>4').replace('<duration>6','<duration>12'),xml).metrics.notes.f1).toBe(1);expect(()=>compareMusicXML('<bad',xml)).toThrow();expect(()=>compareMusicXML('<!DOCTYPE x>'+xml,xml)).toThrow();});
test('backup voices, chords and onset errors are evaluated independently',()=>{
 const xml=score([part('S').replace('<note><rest/>','<backup><duration>2</duration></backup><note><voice>2</voice><rest/>')]);
 const shifted=xml.replace('<backup><duration>2</duration>','<backup><duration>1</duration>');const r=compareMusicXML(shifted,xml);expect(r.metrics.onset.f1).toBe(.5);expect(r.metrics.notes.f1).toBe(.5);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
 const extra=score([part('S'),part('B')]);expect(compareMusicXML(extra,score([part('S')])).metrics.measures.precision).toBe(.5);
});
test('key, meter, clef, lyric and tie changes are separate quality failures',()=>{
 const reference=score([part('S')]);const changed=reference.replace('<fifths>0','<fifths>2').replace('<beats>4','<beats>3').replace('<sign>G','<sign>F').replace('<syllabic>single','<syllabic>begin').replace('<tie type="start"/>','');const r=compareMusicXML(changed,reference);
 for(const c of ['key','time','clef','lyrics','ties'] as const)expect(r.metrics[c].f1).toBe(0);expect(r.metrics.notes.f1).toBe(1);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
});
