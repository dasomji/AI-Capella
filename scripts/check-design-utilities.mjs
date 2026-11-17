/** Validate authored Tailwind literals against the installed compiler and full app.css entry. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';
const root=fileURLToPath(new URL('../',import.meta.url));
// Tailwind's peer is a selector marker; it intentionally has no standalone declaration.
const markers=new Set(['tw:peer']);
let compiler;
export async function compileDesignUtilities(candidates) {
  compiler ??= __unstable__loadDesignSystem(fs.readFileSync(path.join(root,'src/design-system/app.css'),'utf8'),{base:path.join(root,'src/design-system')});
  return (await compiler).candidatesToCss(candidates);
}
function files(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(dir,entry.name);
    return entry.isDirectory()?files(file):/\.tsx?$/.test(file)?[file]:[];
  });
}
export async function auditDesignUtilities() {
  const rows=new Map();
  for(const file of files(path.join(root,'src'))) {
    const relative=path.relative(root,file);
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    function walk(node) {
      if(ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)) {
        for(const candidate of node.text.split(/\s+/).filter(c=>c.startsWith('tw:')&&c.length>3)) {
          const locations=rows.get(candidate)??new Set();
          locations.add(`${relative}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1}`);
          rows.set(candidate,locations);
        }
      }
      ts.forEachChild(node,walk);
    }
    walk(ast);
  }
  const candidates=[...rows.keys()].sort();
  const emitted=await compileDesignUtilities(candidates);
  const missing=candidates.flatMap((candidate,index)=>!emitted[index]&&!markers.has(candidate)?[{candidate,locations:[...rows.get(candidate)]}]:[]);
  return {candidates:candidates.length,ignoredMarkers:candidates.filter(c=>markers.has(c)),missing};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await auditDesignUtilities();
  if(result.missing.length){console.error(JSON.stringify(result,null,2));process.exitCode=1;}
  else console.log(`Design utility emission audit passed: ${result.candidates} candidates; ${result.ignoredMarkers.length} structural marker(s).`);
}
