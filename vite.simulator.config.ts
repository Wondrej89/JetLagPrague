import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export default defineConfig(({command})=>({root:'apps/simulator',envDir:'../..',envPrefix:'VITE_MAPY_API_KEY',base:'./',publicDir:false,plugins:[react(),{
 name:'browser-local-simulator',
 // Read only the allowlisted immutable public release artifacts. Sharing the
 // game's generated public directory races its build/staging writes.
 configureServer(server){server.middlewares.use('/releases',async(req,res)=>{const path=(req.url??'').split('?')[0];if(!/^\/(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(path)||req.method!=='GET'){res.statusCode=404;res.end();return;}try{const bytes=await readFile(fileURLToPath(new URL('./data/releases'+path,import.meta.url)));res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(bytes);}catch{res.statusCode=404;res.end('Publikovaný soubor není dostupný.');}});},
 // The same entry/components run locally and on Pages. This sandbox may read
 // public artifacts and Mapy tiles, but cannot import editor/publisher powers.
 transformIndexHtml:{order:'pre',handler(html){return command==='build'?html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://api.mapy.com; connect-src 'self' https://api.mapy.com; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'"><meta name="referrer" content="origin">`):html;}},
 generateBundle(){for(const id of this.getModuleIds())if(/\/apps\/(?:editor|publisher)\//.test(id)||/\/(?:@geoman-io|geos-wasm|shpjs|proj4|@zip\.js)\//.test(id))this.error('Simulátor nesmí obsahovat editor, publisher ani jejich oprávnění.');}
}],server:{host:'127.0.0.1',port:4177,strictPort:true},build:{outDir:'../../dist/simulator',emptyOutDir:true}}));
