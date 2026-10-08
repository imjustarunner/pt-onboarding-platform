import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
const dist=fileURLToPath(new URL('../dist-plotline/',import.meta.url));
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.xml':'application/xml'};
http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  let file;
  if(/^\/plottline\/(?:product|solutions|careers|resources|about|pricing|start)\/?$/.test(path))file=`pages/${path.split('/')[2]}/index.html`;
  else if(/^\/plottline\/?$/.test(path))file='pages/index.html';
  else if(/^\/plottline\/assets\/[^/]+$/.test(path))file=path.replace('/plottline/','');
  else if(path.startsWith('/assets/plotline/')&&!path.includes('..'))file=path.replace('/assets/','public-assets/');
  if(!file){res.writeHead(404);res.end('Not found');return;}
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(dist+file));}catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PLOTLINE_PREVIEW_PORT || 5176),'127.0.0.1',()=>console.log('Plotline preview ready.'));
