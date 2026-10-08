import sanitizeHtml from 'sanitize-html';
import StorageService from './storage.service.js';
export const trainingHtmlOptions={allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','video','source','figure','figcaption'],allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,'*':['style'],table:['role'],a:['href','title','target','rel','data-training-key'],img:['src','alt','width','height','data-training-key'],video:['src','controls','preload','width','poster','data-training-key'],source:['src','type','data-training-key'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedStyles:{'*':{'color':[/^#[0-9a-f]{3,8}$/i],'background-color':[/^#[0-9a-f]{3,8}$/i],'font-size':[/^\d+(?:px|em|rem)$/],'font-family':[/^[A-Za-z ,'-]+$/],'font-style':[/^(italic|normal)$/],'font-weight':[/^(bold|normal|[1-9]00)$/],'text-align':[/^(left|center|right)$/],'vertical-align':[/^(top|middle|bottom)$/],'width':[/^\d+(?:px|%)$/],'height':[/^\d+(?:px|%)$/],'padding':[/^[0-9pxrem. ]+$/],'margin':[/^[0-9pxrem. ]+$/],'border-radius':[/^\d+(?:px|%)$/],'border':[/^\d+px solid #[0-9a-f]{3,8}$/i],'border-collapse':[/^collapse$/],'object-fit':[/^cover$/]}},allowedSchemes:['https','http','mailto']};
export const sanitizeTrainingHtml=value=>sanitizeHtml(String(value||''),trainingHtmlOptions);
export const trainingKeyAllowed=(key,agencyId)=>new RegExp(`^uploads/training_media/agency_${Number(agencyId)}/(?:image|video)/[a-zA-Z0-9._-]+$`).test(String(key||''))&&Number(agencyId)>0;
/** Resolve only this agency's stored media, and renew private, expiring object access. */
export async function resolveTrainingHtml(value,agencyId){
 const keys=new Set();sanitizeHtml(String(value||''),{...trainingHtmlOptions,transformTags:{'*':(tag,attrs)=>{const key=attrs['data-training-key'];if(key&&trainingKeyAllowed(key,agencyId))keys.add(key);return {tagName:tag,attribs:attrs};}}});
 if(!String(value||'').includes('data-training-key'))return String(value||'').includes('<!DOCTYPE html>') ? value : sanitizeTrainingHtml(value);
 const urls=new Map(await Promise.all([...keys].map(async key=>[key,await StorageService.getSignedUrl(key,60)])));
 const options={...trainingHtmlOptions,transformTags:{'*':(tag,attrs)=>{const key=attrs['data-training-key'];if(key){delete attrs.src;delete attrs.href;if(urls.has(key))attrs[tag==='a'?'href':'src']=urls.get(key);else delete attrs['data-training-key'];}return {tagName:tag,attribs:attrs};}}};
 if(String(value||'').includes('<!DOCTYPE html>'))return String(value).replace(/<(img|video|source|a)\b[^>]*data-training-key="[^"]*"[^>]*>/gi,tag=>{const cleaned=sanitizeHtml(tag,options);return /^<(video|a)\b/i.test(tag)?cleaned.replace(/<\/(video|a)>$/,''):cleaned;});
 return sanitizeHtml(String(value||''),options);
}
export function emailTrainingLinks(value,viewUrl){
 return sanitizeHtml(String(value||''),{...trainingHtmlOptions,transformTags:{img:(tag,attrs)=>attrs['data-training-key']?{tagName:'a',attribs:{href:viewUrl||'#'},text:attrs.alt||'View training image in the app'}:{tagName:tag,attribs:attrs},video:()=>({tagName:'a',attribs:{href:viewUrl||'#'},text:'Open training video in the app'}),source:()=>({tagName:'span',attribs:{}}),a:(tag,attrs)=>attrs['data-training-key']?{tagName:tag,attribs:{href:viewUrl||'#'},text:'Open training attachment in the app'}:{tagName:tag,attribs:attrs}}});
}
