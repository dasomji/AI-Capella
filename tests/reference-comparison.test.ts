// @vitest-environment node
import { test,expect } from 'vitest';
import { compareMusicXML } from '../server/reference-comparison';
const part=(id:string,step='C',number='1')=>`<part id="${id}"><measure number="${number}"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><lyric><syllabic>single</syllabic><text>la</text></lyric></note><note><rest/><duration>6</duration></note></measure></part>`;
const score=(parts:string[])=>`<score-partwise><part-list><score-part id="S"><part-name>Soprano</part-name></score-part><score-part id="B"><part-name>Bass</part-name></score-part></part-list>${parts.join('')}</score-partwise>`;
test('ignores part ordering and printed measure numbers',()=>{const r=compareMusicXML(score([part('B'),part('S','C','99')]),score([part('S'),part('B')]));expect(r.metrics.notes.f1).toBe(1);expect(r.reviewEffort.measuresNeedingEdits).toBe(0);expect(r.qualityPass).toBeNull();});
test('valid XML with wrong pitch is not musical accuracy',()=>{const r=compareMusicXML(score([part('S','D')]),score([part('S')]));expect(r.metrics.notes.f1).toBe(0);expect(r.metrics.pitch.f1).toBe(0);expect(r.metrics.lyrics.f1).toBe(1);expect(r.metrics.ties.f1).toBe(0);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);});
test('missing measures, rests, lyrics and attributes lower recall',()=>{const ref=score([part('S'),part('B')]);const r=compareMusicXML(score([part('S').replace('<text>la</text>','<text>no</text>').replace('<duration>6</duration>','<duration>4</duration>')]),ref);expect(r.metrics.measures.recall).toBe(.5);expect(r.metrics.rests.f1).toBe(0);expect(r.metrics.duration.f1).toBeLessThan(1);expect(r.metrics.lyrics.f1).toBe(0);expect(r.metrics.key.recall).toBe(.5);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);expect(r.reviewEffort.partMeasuresNeedingEdits).toBe(2);});
test('normalizes divisions and rejects unsafe or malformed input',()=>{const xml=score([part('S')]);expect(compareMusicXML(xml.replace('<divisions>2','<divisions>4').replace('<duration>2','<duration>4').replace('<duration>6','<duration>12'),xml).metrics.notes.f1).toBe(1);expect(()=>compareMusicXML('<bad',xml)).toThrow();expect(()=>compareMusicXML('<!DOCTYPE x>'+xml,xml)).toThrow();});
test('backup voices, chords and onset errors are evaluated independently',()=>{
 const xml=score([part('S').replace('<note><rest/>','<backup><duration>2</duration></backup><note><voice>2</voice><rest/>')]);
 const shifted=xml.replace('<backup><duration>2</duration>','<backup><duration>1</duration>');const r=compareMusicXML(shifted,xml);expect(r.metrics.onset.f1).toBe(1);expect(r.metrics.notes.f1).toBe(1);expect(r.metrics.rests.f1).toBe(0);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
 const extra=score([part('S'),part('B')]);expect(compareMusicXML(extra,score([part('S')])).metrics.measures.precision).toBe(.5);
});
test('key, meter, clef, lyric and tie changes are separate quality failures',()=>{
 const reference=score([part('S')]);const changed=reference.replace('<fifths>0','<fifths>2').replace('<beats>4','<beats>3').replace('<sign>G','<sign>F').replace('<syllabic>single','<syllabic>begin').replace('<tie type="start"/>','');const r=compareMusicXML(changed,reference);
 for(const c of ['key','time','clef','lyrics','ties'] as const)expect(r.metrics[c].f1).toBe(0);expect(r.metrics.notes.f1).toBe(1);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
});

const note=(step='C',duration=1,extra='')=>`<note><pitch><step>${step}</step><alter>1.0</alter><octave>4</octave></pitch><duration>${duration}</duration>${extra}</note>`;
const music=(ms:string[],name='Soprano',voice='1')=>`<score-partwise><part-list><score-part id="P"><part-name>${name}</part-name></score-part></part-list><part id="P">${ms.map((m,i)=>`<measure number="${i+1}"><attributes><divisions>1</divisions></attributes>${m.replaceAll('</duration>','</duration><voice>'+voice+'</voice>')}</measure>`).join('')}</part></score-partwise>`;
test('rests never enter pitched metrics; one beat shifts fail onset',()=>{
 const rest=music(['<note><rest/><duration>4</duration></note>']);const r=compareMusicXML(rest,rest);expect(r.metrics.notes.reference).toBe(0);expect(r.metrics.pitch.reference).toBe(0);expect(r.metrics.onset.reference).toBe(0);expect(r.metrics.duration.reference).toBe(0);expect(r.metrics.rests.reference).toBe(1);
 const ref=music([note('C')+note('D')]);expect(compareMusicXML(music(['<forward><duration>1</duration></forward>'+note('C')+note('D')]),ref).metrics.onset.f1).toBe(0);
});
test('missing first measure aligns later notes; renamed parts and voice labels align by content',()=>{
 const ref=music([note('C'),note('D'),note('E')]);const r=compareMusicXML(music([note('D'),note('E')],'Soprano 1','2'),ref);expect(r.metrics.notes.recall).toBeCloseTo(2/3);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
 expect(compareMusicXML(music([note()],'Soprano 1','2'),music([note()])).metrics.notes.f1).toBe(1);
});
test('a wrong initial key creates one edit rather than cascading',()=>{
 const xml=music(['<attributes><key><fifths>0</fifths></key></attributes>'+note(),note(),note()]);const r=compareMusicXML(xml.replace('<fifths>0','<fifths>2'),xml);expect(r.metrics.key.reference).toBe(1);expect(r.reviewEffort.measuresNeedingEdits).toBe(1);
});
test('tied halves equal a sustained note and numeric alters normalize',()=>{
 const tied=music([note('C',1,'<tie type="start"/>')+note('C',1,'<tie type="stop"/>')]);const whole=music([note('C',2)]).replace('<alter>1.0','<alter>1');const r=compareMusicXML(tied,whole);expect(r.metrics.notes.f1).toBe(1);expect(r.metrics.ties.f1).toBe(1);
});
test('elided lyric syllables retain all text',()=>{
 const xml=music([note('C',1,'<lyric><text>la</text><elision> </elision><text>lu</text></lyric>')]);expect(compareMusicXML(xml,xml.replace('<text>la</text><elision> </elision><text>lu</text>','<text>la lu</text>')).metrics.lyrics.f1).toBe(1);expect(compareMusicXML(xml,xml.replace('<text>lu</text>','<text>no</text>')).metrics.lyrics.f1).toBe(0);
});
