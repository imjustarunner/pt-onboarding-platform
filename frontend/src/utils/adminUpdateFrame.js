/** Keep fragment navigation inside srcdoc instead of inheriting the host page URL.
 * The iframe grants same-origin DOM access but deliberately does not run scripts. */
export function connectAdminUpdateFrame(event) {
  const doc=event.target.contentDocument;
  if(!doc)return;
  // App pages need their own browsing context; scripts are intentionally disabled
  // in this reading frame. Keep topic anchors within the update.
  for(const link of doc.querySelectorAll('a[href]')) {
    const href=link.getAttribute('href')||'';
    if(/^(https?:\/\/|\/(?!\/))/.test(href)) {
      link.target='_blank';link.rel='noopener noreferrer';
    }
  }
  doc.addEventListener('click',e=>{
    const link=e.target.closest('a[href^="#"],a[href^="about:srcdoc#"]');
    if(!link)return;
    let id;try{id=decodeURIComponent(link.getAttribute('href').split('#').slice(1).join('#'));}catch{return;}
    const target=doc.getElementById(id);
    if(target){e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}
  });
  for(const type of ['pointerdown','keydown','scroll'])doc.addEventListener(type,()=>document.dispatchEvent(new Event('provider-update-activity')),{passive:true,capture:true});
}
// Fragment-only links inherit the parent's URL in srcdoc. Use the document's own
// URL so topics work immediately, even while external photos are still loading.
export function adminUpdateFrameHtml(html) {
  return String(html || '').replace(/href=(["'])#([^"']+)\1/gi, 'href=$1about:srcdoc#$2$1');
}
