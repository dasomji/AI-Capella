// Test-only worker. No OpenAI provider is instantiated or called.
import { TranscriptionWorker } from '../server/transcription.server';
import { FakeProvider,ReferenceRenderer } from '../server/transcription-provider.server';
import { ScoreAssembler } from '../server/score-assembly.server';
import { pool } from '../server/db/index.server';
if(process.env.NODE_ENV!=='test')throw Error('Test only');
const fake=new FakeProvider(()=> 'uncertain',700);
const provider={model:fake.model,promptVersion:fake.promptVersion,async transcribePage(...args:Parameters<typeof fake.transcribePage>){const r=await fake.transcribePage(...args);return {...r,musicxmlFragment:r.musicxmlFragment,uncertainties:[{page:args[0].pageIndex+1,part:'P1',measure:String(args[0].pageIndex+1),message:'Check pitch'}]};}};
const worker=new TranscriptionWorker(provider,new ReferenceRenderer(),new ScoreAssembler());let stop=false;process.on('SIGTERM',()=>{stop=true;});
try{while(!stop){if(!await worker.tick())await new Promise(r=>setTimeout(r,150));}}finally{await pool.end();}
