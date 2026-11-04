import { z } from 'zod';
const schema=z.record(z.string(),z.object({input:z.number().finite().nonnegative(),output:z.number().finite().nonnegative()}).strict());
export function priceTable(json:string){return schema.parse(JSON.parse(json));}
export function estimatedCost(model:string,usage:{inputTokens?:number;outputTokens?:number},prices:ReturnType<typeof priceTable>){const price=prices[model];return price&&Number.isFinite(usage.inputTokens)&&Number.isFinite(usage.outputTokens)?((usage.inputTokens??0)*price.input+(usage.outputTokens??0)*price.output)/1e6:null;}
