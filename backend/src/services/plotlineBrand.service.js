import sharp from 'sharp';
import crypto from 'node:crypto';

export const PLOTLINE_THEMES = Object.freeze({
 clarity: {label:'Clarity', font:'Montserrat', heading:'Montserrat', radius:12},
 studio: {label:'Studio', font:'Plotline Inter', heading:'Plotline Sora', radius:24},
 story: {label:'Story', font:'Plotline Inter', heading:'Georgia', radius:4}
});
const fail = message => Object.assign(new Error(message), {status:400,code:'INVALID_BRAND'});
const text = (value,max) => typeof value==='string' ? value.trim().slice(0,max) : '';
export function plotlineBrand(input={}) {
 if(!input || typeof input!=='object' || Array.isArray(input))throw fail('Choose your company’s brand settings.');
 const theme=input.theme || 'clarity';
 if(!Object.hasOwn(PLOTLINE_THEMES,theme))throw fail('Choose Clarity, Studio or Story.');
 const primary=input.primary || '#205846',accent=input.accent || '#DCAA73';
 if(![primary,accent].every(c=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c)))throw fail('Choose a six-digit hex color.');
 return {version:1,theme,primary:primary.toUpperCase(),accent:accent.toUpperCase(),mission:text(input.mission,3000),
   headline:text(input.headline,180),introduction:text(input.introduction,3000)};
}
export function plotlineCopy(input={}) {
 // Source-preserving fallback. No model call or unprovided benefit/culture claim.
 const mission=text(input.mission,3000);
 return {headline:'Make meaningful work happen.',introduction:mission,
   source:'your_mission',message:'A starting point from your words. Review and edit before publishing.'};
}
export async function preparePlotlineLogo(file) {
 if(!file?.buffer || file.buffer.length>5*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(file.mimetype))throw fail('Use a PNG, JPEG or WebP logo up to 5 MB.');
 try {
   const img=sharp(file.buffer,{limitInputPixels:8000000,animated:false,failOn:'error'});
   const info=await img.metadata();
   if(!['png','jpeg','webp'].includes(info.format) || info.pages>1)throw fail('Use a single PNG, JPEG or WebP image.');
   // Decode/re-encode; strip metadata and disregard the supplied filename.
   const buffer=await img.rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
   const {data,info:small}=await sharp(buffer).resize(64,64,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const colors=new Map();
   for(let i=0;i<small.width*small.height*4;i+=4){
     const [r,g,b,a]=data.subarray(i,i+4);
     if(a<160 || Math.max(r,g,b)-Math.min(r,g,b)<22 || Math.max(r,g,b)>246 && Math.min(r,g,b)>225)continue;
     const key=[r,g,b].map(n=>Math.min(255,Math.round(n/24)*24)).join(',');
     colors.set(key,(colors.get(key)||0)+1);
   }
   const ranked=[...colors].sort((a,b)=>b[1]-a[1]).map(([key])=>key.split(',').map(Number));
   const primary=ranked[0],accent=ranked.find(c=>primary&&c.reduce((v,n,i)=>v+(n-primary[i])**2,0)>6000);
   const hex=c=>c?'#'+c.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase():null;
   return {buffer,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),primary:hex(primary),accent:hex(accent)};
 } catch(error) {if(error.code==='INVALID_BRAND')throw error;throw fail('We couldn’t read that logo. Try another PNG, JPEG or WebP. Your saved settings are unchanged.');}
}
