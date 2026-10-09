import QRCode from 'qrcode';
import {resolveMembershipLogoUrl} from './peerTenantBrand';

const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ink = (hex, fallback) => /^#[a-f0-9]{6}$/i.test(hex || '')
  ? '#' + hex.slice(1).match(/../g).map(v => Math.min(95, Math.round(parseInt(v,16)*.6)).toString(16).padStart(2,'0')).join('') : fallback;

// Reserve a centered logo without covering alignment/timing/format patterns.
// Some QR versions have a central alignment target: choose a later version
// with a clear center rather than painting a logo over that target.
export function profileQrLayout(url) {
  const parsed=new URL(url);
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||url.length>500)throw new Error('Use a public profile link.');
  const first=QRCode.create(url,{errorCorrectionLevel:'H'});
  for(let version=first.version;version<=40;version++){
    const qr=version===first.version?first:QRCode.create(url,{errorCorrectionLevel:'H',version});
    const n=qr.modules.size;
    for(let size=Math.floor(n*.23)|1;size>=Math.max(7,Math.floor(n*.14));size-=2){
      const from=(n-size)/2;
      let clear=true;
      for(let r=from;r<from+size;r++)for(let c=from;c<from+size;c++)if(qr.modules.isReserved(r,c))clear=false;
      if(clear)return {qr,n,from,size};
    }
  }
  throw new Error('The profile link is too long for a branded QR code.');
}
export function profileQrSvg(url,{logo,primary,accent,label='View my profile'}={}) {
  if(!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo||''))throw new Error('An agency logo is required.');
  const {qr,n,from,size}=profileQrLayout(url),unit=900/(n+8),start=4*unit;
  const a=ink(primary,'#164d51'),b=ink(accent,'#365b35'),dots=[];
  const finder=(r,c)=>(r<7&&(c<7||c>=n-7))||(r>=n-7&&c<7);
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    if(!qr.modules.get(r,c)||finder(r,c)||(r>=from&&r<from+size&&c>=from&&c<from+size))continue;
    const x=start+c*unit,y=start+r*unit;
    dots.push(qr.modules.isReserved(r,c)?`<rect x="${x}" y="${y}" width="${unit}" height="${unit}"/>`:`<circle cx="${x+unit/2}" cy="${y+unit/2}" r="${unit*.48}"/>`);
  }
  const eyes=[[0,0],[n-7,0],[0,n-7]].map(([c,r])=>{const x=start+c*unit,y=start+r*unit;return `<rect x="${x}" y="${y}" width="${7*unit}" height="${7*unit}" rx="${unit*1.4}" fill="${a}"/><rect x="${x+unit}" y="${y+unit}" width="${5*unit}" height="${5*unit}" rx="${unit*.8}" fill="white"/><rect x="${x+2*unit}" y="${y+2*unit}" width="${3*unit}" height="${3*unit}" rx="${unit*.5}" fill="${b}"/>`;}).join('');
  const inset=start+from*unit,logoSize=size*unit;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1120" viewBox="0 0 1000 1120"><rect width="1000" height="1120" rx="42" fill="white"/><rect x="2" y="2" width="996" height="1116" rx="40" fill="none" stroke="#dbe7e3" stroke-width="4"/><defs><linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="900" y2="900"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><g transform="translate(50 50)"><g fill="url(#ink)">${dots.join('')}</g>${eyes}<rect x="${inset}" y="${inset}" width="${logoSize}" height="${logoSize}" rx="${unit}" fill="white"/><image href="${logo}" x="${inset+unit*.3}" y="${inset+unit*.3}" width="${logoSize-unit*.6}" height="${logoSize-unit*.6}" preserveAspectRatio="xMidYMid meet"/></g><text x="500" y="1008" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="${a}">${escape(label).slice(0,200)}</text><text x="500" y="1052" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="#536663">Scan to view my profile &amp; availability</text></svg>`;
}
function imageFrom(src){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';const timer=setTimeout(()=>reject(new Error('Agency logo timed out. Please try again.')),15000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('Agency logo could not be loaded. Please try again.'));};image.src=src;});}
export async function createProviderProfileQr(url,agency={}) {
  const logo=await imageFrom(resolveMembershipLogoUrl(agency)||'');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
  const scale=Math.min(480/logo.naturalWidth,480/logo.naturalHeight);ctx.drawImage(logo,(512-logo.naturalWidth*scale)/2,(512-logo.naturalHeight*scale)/2,logo.naturalWidth*scale,logo.naturalHeight*scale);
  let palette=agency.color_palette||{};if(typeof palette==='string'){try{palette=JSON.parse(palette);}catch{palette={};}}
  const svg=profileQrSvg(url,{logo:canvas.toDataURL('image/png'),primary:palette.primary,accent:palette.secondary,label:agency.name||'My profile'});
  const image=await imageFrom('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));canvas.width=1000;canvas.height=1120;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png');
}
