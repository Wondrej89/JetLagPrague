// Local production-artifact server used by E2E; no application state or credentials.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('dist/site'), prefix='/JetLagPrague/';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.svg':'image/svg+xml','.gz':'application/gzip','.wasm':'application/wasm','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 try {const pathname=decodeURIComponent(new URL(req.url??'/', 'http://localhost').pathname);if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 let file=resolve(root,pathname.slice(prefix.length));if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}if((await stat(file)).isDirectory())file=resolve(file,'index.html');const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Nenalezeno');}
}).listen(4175,'127.0.0.1',()=>process.stdout.write('Pages artifact: http://127.0.0.1:4175/JetLagPrague/\n'));
