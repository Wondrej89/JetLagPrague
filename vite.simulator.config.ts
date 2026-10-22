import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export default defineConfig(({command})=>({root:'apps/simulator',envDir:'../..',base:'./',publicDir:false,plugins:[react(),{
 name:'private-simulator-development-only',
 // Read only the allowlisted immutable public release artifacts. Sharing the
 // game's generated public directory races its build/staging writes.
 configureServer(server){server.middlewares.use('/releases',async(req,res)=>{const path=(req.url??'').split('?')[0];if(!/^\/(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(path)||req.method!=='GET'){res.statusCode=404;res.end();return;}try{const bytes=await readFile(fileURLToPath(new URL('./data/releases'+path,import.meta.url)));res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(bytes);}catch{res.statusCode=404;res.end('Publikovaný soubor není dostupný.');}});},
 transformIndexHtml:{order:'pre',handler(html){return command==='build'?html.replace('/src/main.tsx','/src/public.tsx'):html;}},
 generateBundle(){for(const id of this.getModuleIds())if((id.includes('/apps/simulator/src/')&&!/\/public\.(?:tsx|css)(?:\?|$)/.test(id))||/\/packages\/(?:game-core|game-ui|geo-resolver)\//.test(id))this.error('Soukromá simulace nesmí být součástí veřejného artefaktu.');}
}],server:{host:'127.0.0.1',port:4177,strictPort:true},build:{outDir:'../../dist/simulator',emptyOutDir:true}}));
