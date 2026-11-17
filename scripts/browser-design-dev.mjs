/** Disposable development-only host for the real showcase and read-only screen fixtures. */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
const evidence=path.resolve(process.env.BROWSER_EVIDENCE??'.review-evidence/design-system');
await fs.mkdir(evidence,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {DesignSystemShowcase} from '/src/design-system/showcase.tsx';import {initializeTheme} from '/src/design-system/theme/index.ts';import '/src/design-system/app.css';initializeTheme();createRoot(document.getElementById('root')).render(React.createElement(DesignSystemShowcase));`;
const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(evidence,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-router','@tanstack/react-table','fflate','socket.io-client','verovio/esm','verovio/wasm','zod','jspdf','svg2pdf.js']},plugins:[react(),tailwind(),{name:'standalone-showcase',
  configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url?.startsWith('/healthz')){res.end('ok');return;}
    if(!req.url?.startsWith('/dev/design-system'))return next();
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/src/design-system/app.css"></head><body><div id="root"></div><script type="module" src="/design-entry.tsx"></script></body></html>');
  });},resolveId(id){if(id==='/design-entry.tsx')return '\0design-entry';},load(id){if(id==='\0design-entry')return entry;},
}],server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
try {
  await server.listen();
  const base=server.resolvedUrls.local[0].replace(/\/$/,'');
  const child=spawn(process.execPath,[process.env.DESIGN_BROWSER_SCRIPT??'scripts/browser-design-system-runner.mjs'],{stdio:'inherit',env:{...process.env,BASE_URL:base,EVIDENCE_DIR:evidence,BROWSER_EVIDENCE:evidence}});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)process.exitCode=code??1;
}finally{await server.close();}
