import { z } from 'zod';
/** Shared title boundary: reject malformed input, remove invisible formatting. */
export const cleanTitle=(s:string)=>s.normalize('NFC').replace(/[\x01-\x1f\x7f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,'').trim();
export const optionalTitle=z.string().max(200).refine(s=>!s.includes('\0')&&s.isWellFormed()).transform(cleanTitle);
export const pieceTitle=optionalTitle.refine(s=>s.length>0);
