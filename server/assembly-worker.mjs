import { parentPort,workerData } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';
try{const {ScoreAssembler}=await tsImport('./score-assembly.server.ts',import.meta.url);parentPort.postMessage({result:await new ScoreAssembler().assembleDetailed(workerData)});}catch(error){parentPort.postMessage({error:error.reason??'infrastructure_error'});}
