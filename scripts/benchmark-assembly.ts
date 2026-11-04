// Offline structural benchmark; no provider calls. Wall time includes worker startup.
import {assembleOffThread} from '../server/assembly-worker.server';
import type {PageResult} from '../server/transcription-provider.server';
const ids=Array.from({length:12},(_,i)=>'P'+i);
const xml=`<score-partwise><part-list>${ids.map(id=>`<score-part id="${id}"><part-name>${id}</part-name></score-part>`).join('')}</part-list>${ids.map(id=>`<part id="${id}">${Array.from({length:30},(_,i)=>`<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>':''}<note><rest/><duration>4</duration></note></measure>`).join('')}</part>`).join('')}</score-partwise>`;
const page:PageResult={musicxmlFragment:xml,model:'offline',promptVersion:'fixture',usage:{inputTokens:0,outputTokens:0},uncertainties:[],latency:0};
const start=performance.now();const result=await assembleOffThread(Array(60).fill(page));console.log(JSON.stringify({milliseconds:Math.round(performance.now()-start),parts:12,pages:60,measuresPerPage:30,sidecarBytes:Buffer.byteLength(JSON.stringify(result.provenance)),targetMilliseconds:3000,profile:result.profile}));
