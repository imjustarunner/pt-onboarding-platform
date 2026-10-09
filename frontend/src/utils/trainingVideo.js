export function youtubeVideoId(value) {
 try { const u=new URL(value); if(u.protocol!=='https:')return ''; let id='';
 if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(u.hostname)) id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
 else if(u.hostname==='youtu.be')id=u.pathname.slice(1);
 return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:'';
 }catch{return '';}
}
export function openTrainingVideo({url,title='Training video',youtube=false,trigger,doc=document}) {
 const id=youtubeVideoId(url); if(youtube&&!id)return;
 if(!id&&!/^https?:\/\//i.test(url)&&!/^\/(?!\/)/.test(url))return;
 const dialog=doc.createElement('dialog');dialog.setAttribute('aria-label',title);dialog.style.cssText='width:min(760px,90vw);padding:20px;border:0;border-radius:16px;box-shadow:0 20px 70px #0008;';
 const heading=doc.createElement('h2');heading.textContent=title;
 const close=doc.createElement('button');close.type='button';close.textContent='Close video';close.style.cssText='padding:10px 16px;margin-bottom:12px;font:inherit;';
 const player=doc.createElement(id?'iframe':'video');player.style.cssText='width:100%;aspect-ratio:16/9;border:0;background:#000;';
 if(id){player.src=`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;player.title=title;player.allow='autoplay; encrypted-media; picture-in-picture';player.setAttribute('allowfullscreen','');player.referrerPolicy='strict-origin-when-cross-origin';}
 else{player.src=url;player.controls=true;player.autoplay=true;}
 const cleanup=()=>{if(!id){try{player.pause();}catch{}}player.removeAttribute('src');dialog.remove();trigger?.focus?.();};
 close.onclick=()=>{if(dialog.close)dialog.close();else cleanup();};dialog.addEventListener('close',cleanup,{once:true});dialog.addEventListener('cancel',()=>{setTimeout(cleanup,0);},{once:true});
 dialog.append(close,heading,player);doc.body.append(dialog);if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');close.focus();return dialog;
}
/** Enhance only saved media; no arbitrary embedded HTML or scripts are executed. */
export function connectTrainingVideos(root,hostDocument=document) {
 const doc=root.ownerDocument||root;
 if(!doc.getElementById('training-video-style')){const style=doc.createElement('style');style.id='training-video-style';style.textContent='.training-video-button{display:inline-flex;align-items:center;gap:10px;padding:14px 20px;background:#315f8c;color:white;border:0;border-radius:12px;font:600 16px system-ui;cursor:pointer;animation:training-pulse 2s ease-in-out infinite}@keyframes training-pulse{50%{box-shadow:0 0 0 7px #315f8c28}}@media(prefers-reduced-motion:reduce){.training-video-button{animation:none}}';(doc.head||root).append(style);}
 for(const media of root.querySelectorAll('video,a[href]')){const raw=media.getAttribute(media.tagName==='VIDEO'?'src':'href')||media.querySelector('source')?.getAttribute('src');const youtube=!!youtubeVideoId(raw);if(media.tagName!=='VIDEO'&&!youtube)continue;if(media.dataset.videoEnhanced)continue;media.dataset.videoEnhanced='true';
 const button=doc.createElement('button');button.type='button';button.className='training-video-button';const title=media.closest('figure')?.querySelector('figcaption')?.textContent?.trim()||'Watch instructions';button.textContent=`▶ ${title}`;button.addEventListener('click',()=>openTrainingVideo({url:raw,title,youtube,trigger:button,doc:hostDocument}));media.before(button);media.hidden=true;
 }
}
