import { tenantLegalProfiles } from '../frontend/src/content/tenantLegalProfiles.js';
import { renderItscoLegalHtml } from '../frontend/src/utils/itscoLegalHtml.js';
const profile = tenantLegalProfiles.auricwell;
export const auricwellLegalPages = {
  name: 'auricwell-public-policies',
  generateBundle() {
    for (const type of ['terms', 'privacypolicy', 'platformhipaa']) this.emitFile({type:'asset',fileName:`legal/${type}.html`,source:renderItscoLegalHtml(type,profile,{logo:'/auricwell-logo.png'})});
  },
  configureServer(server) {
    server.middlewares.use((req,res,next)=>{
      const path=String(req.url||'').split('?')[0];
      const type=path.match(/^\/(?:auricwell\/)?(terms|privacypolicy|platformhipaa)\/?$/)?.[1];
      if(!type)return next();
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(renderItscoLegalHtml(type,profile,{logo:'/auricwell-logo.png'}));
    });
  }
};
