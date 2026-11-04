import { z } from 'zod';
/** Shared title boundary: reject malformed input, remove invisible formatting. */
export const cleanTitle=(s:string)=>s.normalize('NFC').replace(/[\n\r\t]+/g,' ').replace(/[\x01-\x1f\x7f\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff\u00ad\u2028\u2029\u{e0000}-\u{e007f}]/gu,'').trim().replace(/^[\u200c\u200d]+|[\u200c\u200d]+$/gu,'').replace(/[\u200c\u200d]{2,}/gu,'').trim();
export const optionalTitle=z.string().max(200).refine(s=>!s.includes('\0')&&s.isWellFormed()).transform(cleanTitle);
export const pieceTitle=optionalTitle.refine(s=>s.length>0);

export const truncateTitle=(s:string,max=200)=>{let result='';for(const point of s){if(result.length+point.length>max)break;result+=point;}return result;};
