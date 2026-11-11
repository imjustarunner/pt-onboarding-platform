import DOMPurify from 'dompurify';

export const hasAppEmailChrome = message => /data-portal-email=["']v[12]|\/email-signatures\/|Part of the SchoolCareBridge network|MH4Kidz/i.test(String(message?.body_html || ''));

// Presentation only. Keep all footer content available, without repeating it inline.
function collapseAppEmailChrome(container){
 const footer=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Email signature and footer';footer.append(summary);
 const move=node=>{if(node && !footer.contains(node) && node!==container)footer.append(node);};
 for(const image of [...container.querySelectorAll('img')]){
  const value=`${image.getAttribute('src') || ''} ${image.alt || ''}`;
  const socialLink=/https?:\/\/(?:www\.)?(?:facebook|instagram|youtube|linkedin|twitter|x)\.com\//i.test(image.closest('a')?.getAttribute('href') || '');
  if(socialLink || /email-signatures|schoolcarebridge|plottwist|MH4Kidz|(?:facebook|instagram|youtube|linkedin|twitter|social)[-_./]/i.test(value))move(image.closest('a') || image);
 }
 const labels=/^(?:CONFIDENTIAL AND POTENTIALLY SENSITIVE INFORMATION!?|Part of the SchoolCareBridge network|A program of MH4Kidz|MENTAL HEALTH SUPPORT\. STRONGER SCHOOL COMMUNITIES\.?|powered by\s*Plot\s*TwistCo)$/i;
 for(const node of [...container.querySelectorAll('p,div,strong,b,h1,h2,h3,h4,td')]){
  if(footer.contains(node) || !labels.test((node.textContent || '').replace(/\s+/g,' ').trim()))continue;
  if([...node.children].some(child=>labels.test((child.textContent || '').replace(/\s+/g,' ').trim())))continue;
  const block=node.closest('p') || node;
  const next=block.nextElementSibling;
  const confidential=/^CONFIDENTIAL/i.test(node.textContent.trim());move(block);
  if(confidential && next && /^(?:The information enclosed|If you are not the intended recipient)/i.test(next.textContent.trim()))move(next);
 }
 if(footer.childNodes.length>1)container.append(footer);
}

export function renderEmailContent({ body_html, body_text } = {}, { collapseQuotes = true, loadExternalImages = false, compactLayout = false, simplifyAppChrome = false } = {}) {
  let hasBlockedImages = false;
  const html = body_html || '';
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['a','p','br','div','span','strong','b','em','i','u','s','ul','ol','li','blockquote','pre','code','hr','h1','h2','h3','h4','table','thead','tbody','tr','th','td','img'],
    ALLOWED_ATTR: ['href','title','class','colspan','rowspan','src','alt','width','height','style'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
  });
  const container = document.createElement('div');
  container.append(fragment);
  if (!html) {
    const text = String(body_text || '');
    // Use text nodes for all sender-controlled text, including URL labels.
    const pattern = /https?:\/\/[^\s<>]+/gi;
    let position = 0;
    for (const match of text.matchAll(pattern)) {
      const url = match[0].replace(/[.,;!?)\]]+$/, '');
      container.append(document.createTextNode(text.slice(position, match.index)));
      const link = document.createElement('a'); link.href = url; link.textContent = url; container.append(link);
      position = match.index + url.length;
    }
    container.append(document.createTextNode(text.slice(position)));
  }
  if (collapseQuotes) {
    for (const quoted of container.querySelectorAll('blockquote,.gmail_quote')) {
      if (quoted.closest('details')) continue;
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = 'Show quoted conversation';
      quoted.replaceWith(details); details.append(summary, quoted);
    }
  }
  for (const image of container.querySelectorAll('img')) {
    const source = image.getAttribute('src') || '';
    // Omit hidden pixels even when the reader explicitly loads external images.
    const dimensions = [image.getAttribute('width'), image.getAttribute('height'), image.style.width, image.style.height];
    const tiny = dimensions.some(value => value && /^\d+(?:\.\d+)?(?:px)?$/.test(value) && Number.parseFloat(value) <= 2);
    let url;
    try { url = new URL(source); } catch { /* Relative and CID images are not web URLs. */ }
    if (tiny || image.style.display === 'none' || image.style.visibility === 'hidden' || image.style.opacity === '0' || !url || url.protocol !== 'https:' || url.username || url.password || /\/track[-_/]?open(?:\/|$)/i.test(url.pathname)) {
      image.remove(); continue;
    }
    const hostedSignature = /^(?:ci\d+|lh\d+(?:-[a-z]+)?)\.googleusercontent\.com$/i.test(url.hostname) ||
      (url.hostname === 'plottwisthq.com' && /^\/(?:uploads|email-signatures)\//.test(url.pathname));
    if (!hostedSignature && !loadExternalImages) {
      hasBlockedImages = true;
      const placeholder = document.createElement('span');
      placeholder.textContent = image.alt ? `[Image: ${image.alt}]` : '[External image]';
      image.replaceWith(placeholder); continue;
    }
    image.setAttribute('referrerpolicy', 'no-referrer');
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
    for (const attr of ['width', 'height']) {
      if (!/^\d{1,4}$/.test(image.getAttribute(attr) || '')) image.removeAttribute(attr);
    }
  }
  // Preserve signature layout without allowing email CSS to position content over the app,
  // fetch resources, or reference application variables.
  const styleProperties = new Set(['color','background-color','font-family','font-size','font-weight','font-style','text-align','text-decoration','vertical-align','line-height','letter-spacing','border','border-top','border-bottom','border-left','border-right','border-radius','border-collapse','padding','padding-top','padding-bottom','padding-left','padding-right','margin','margin-top','margin-bottom','margin-left','margin-right','width','height','max-width','object-fit','object-position']);
  for (const node of container.querySelectorAll('[style]')) {
    const clean = document.createElement('span').style;
    for (let index = 0; index < node.style.length; index++) {
      const key = node.style[index], value = node.style.getPropertyValue(key);
      if (styleProperties.has(key) && !/url\s*\(|expression\s*\(|var\s*\(|image\s*\(|[\\@<>]/i.test(value)) clean.setProperty(key, value);
    }
    node.removeAttribute('style');
    if (clean.cssText) node.setAttribute('style', clean.cssText);
  }
  const imageWidths=new Map([...container.querySelectorAll('img')].map(image=>[image,Number.parseFloat(image.getAttribute('width') || image.style.width) || 160]));
  if(compactLayout){
    // Reading presentation only: keep content and links, discard fixed-width email chrome.
    for(const node of container.querySelectorAll('[style]')){
      const callToAction=node.tagName==='A' && !!node.style.backgroundColor;
      for(const key of ['color','font-family','width','height','max-width','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','border','border-top','border-right','border-bottom','border-left','border-radius','background-color','font-size','line-height','letter-spacing'])node.style.removeProperty(key);
      if(callToAction){node.style.display='block';node.style.width='fit-content';node.style.maxWidth='100%';node.style.padding='8px 12px';node.style.margin='8px 0';node.style.backgroundColor='#edf3ff';node.style.color='#2458ad';node.style.borderRadius='8px';}
    }
    for(const table of [...container.querySelectorAll('table')]){
      if(table.querySelector('th'))continue;
      const box=document.createElement('div');while(table.firstChild)box.append(table.firstChild);table.replaceWith(box);
      for(const node of [...box.querySelectorAll('thead,tbody,tr,td')]){const block=document.createElement('div');while(node.firstChild)block.append(node.firstChild);node.replaceWith(block);}
    }
    for(const image of container.querySelectorAll('img')){image.removeAttribute('width');image.removeAttribute('height');image.style.setProperty('width',`${Math.min(160,imageWidths.get(image))}px`,'important');image.style.setProperty('max-width','100%','important');image.style.setProperty('height','auto','important');}
  }
  if(simplifyAppChrome && hasAppEmailChrome({body_html:html}))collapseAppEmailChrome(container);
  for (const node of container.querySelectorAll('[class]')) node.removeAttribute('class');
  for (const link of container.querySelectorAll('a')) {
    const href = link.getAttribute('href') || '';
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) link.removeAttribute('href');
    else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  return { html: container.innerHTML, hasBlockedImages };
}

export function readableEmailHtml(message, options) {
  return renderEmailContent(message, options).html;
}

export function emailDeliveryLabel(message = {}) {
  switch (message.send_status) {
    case 'scheduled': return message.scheduled_send_at ? `Scheduled for ${new Date(message.scheduled_send_at).toLocaleString()}` : 'Queued for delivery';
    case 'queued': case 'pending': return 'Queued for delivery';
    case 'sending': return 'Sending…';
    case 'failed': return 'Send failed — this email was not confirmed sent';
    case 'cancelled': return 'Send cancelled';
    case 'sent': return message.direction === 'outbound' ? 'Sent' : '';
    default: return message.send_status ? 'Delivery confirmation pending' : '';
  }
}
