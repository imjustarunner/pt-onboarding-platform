import QRCode from 'qrcode';
import { safeLogo, safeColor, cardLogoMarkup } from './businessCards';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cardQrUrl(organization) {
  const raw = String(organization.qrUrl || (Object.hasOwn(organization, 'backWebsite') ? organization.backWebsite : organization.website) || '').trim();
  if (!raw) throw new Error('Set the organization website or QR destination before printing backs.');
  let url; try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new Error('Enter a valid website URL for the QR code.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.href.length > 300) throw new Error('Use a complete HTTP or HTTPS website URL for the QR code.');
  return url.href;
}
// Keep brand hues, with enough ink density for a printed scanner target.
const darken = hex => {
  const rgb = safeColor(hex, '#167779').slice(1).match(/../g).map(v => parseInt(v, 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const hue = delta === 0 ? 0 : max === rgb[0] ? ((rgb[1] - rgb[2]) / delta + 6) % 6 : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
  const light = Math.min((max + min) / 2, .30), saturation = delta === 0 ? 0 : .72;
  const c = (1 - Math.abs(2 * light - 1)) * saturation, x = c * (1 - Math.abs(hue % 2 - 1)), m = light - c / 2;
  const parts = hue < 1 ? [c,x,0] : hue < 2 ? [x,c,0] : hue < 3 ? [0,c,x] : hue < 4 ? [0,x,c] : hue < 5 ? [x,0,c] : [c,0,x];
  return '#' + parts.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
};
export function cardBackSvg(card, fonts = {}, bleedInches = 0, bottomBleedInches = bleedInches) {
  const url = cardQrUrl(card);
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size, module = 600 / (n + 8), start = 75 + 4 * module;
  const finder = (r,c) => (r < 7 && (c < 7 || c >= n-7)) || (r >= n-7 && c < 7);
  const centerSize = Math.max(3, Math.floor(n * .24) | 1), from = Math.floor((n-centerSize)/2), to = from + centerSize;
  let logo = safeLogo(card.watermarkLogo) || safeLogo(card.logo);
  for(let r=from;r<to;r++)for(let c=from;c<to;c++)if(qr.modules.isReserved(r,c))logo='';
  const dots=[];
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    if(!qr.modules.get(r,c)||finder(r,c)||(logo&&r>=from&&r<to&&c>=from&&c<to))continue;
    const x=start+c*module,y=start+r*module;
    dots.push(qr.modules.isReserved(r,c)?`<rect x="${x}" y="${y}" width="${module}" height="${module}"/>`:`<circle cx="${x+module/2}" cy="${y+module/2}" r="${module*.49}"/>`);
  }
  const eyes=[[0,0],[n-7,0],[0,n-7]].map(([c,r])=>{
    const x=start+c*module,y=start+r*module;
    return `<rect x="${x}" y="${y}" width="${7*module}" height="${7*module}" rx="${1.7*module}" fill="${darken(card.accent)}"/><rect x="${x+module}" y="${y+module}" width="${5*module}" height="${5*module}" rx="${module}" fill="white"/><rect x="${x+2*module}" y="${y+2*module}" width="${3*module}" height="${3*module}" rx="${.7*module}" fill="${darken(card.primary)}"/>`;
  }).join('');
  const b=bleedInches*300, bottom=bottomBleedInches*300;
  const caption=String(card.backCaption||'Explore our website').slice(0,80);
  const label=String(card.backWebsite||card.website||new URL(url).hostname).replace(/^https?:\/\//,'').replace(/\/$/,'');
  const font= /^data:font\/ttf;base64,[a-z0-9+/=]+$/i.test(fonts.body||'') ? `@font-face{font-family:CardBody;src:url('${fonts.body}') format('truetype');font-weight:400;}`:'';
  const fitted=(value,size)=>fonts.measure?Math.min(size,size*620/Math.max(1,fonts.measure(value,size,'CardBody',400))):size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${750+2*b}" height="${750+b+bottom}" viewBox="${-b} ${-b} ${750+2*b} ${750+b+bottom}"><metadata>${escape(fonts.licenses)}</metadata><style>${font}</style><defs><linearGradient id="qrInk" gradientUnits="userSpaceOnUse" x1="0" y1="${start}" x2="0" y2="${start+n*module}"><stop stop-color="${darken(card.primary)}"/><stop offset="1" stop-color="${darken(card.accent)}"/></linearGradient></defs><rect x="${-b}" y="${-b}" width="${750+2*b}" height="${750+b+bottom}" fill="white"/><g fill="url(#qrInk)">${dots.join('')}</g>${eyes}${logo?`<rect x="${start+from*module}" y="${start+from*module}" width="${centerSize*module}" height="${centerSize*module}" fill="white"/>${cardLogoMarkup(card.watermarkLogo ? {logo} : card, start+from*module, start+from*module, centerSize*module, centerSize*module)}`:''}<text x="375" y="49" text-anchor="middle" font-family="CardBody,sans-serif" font-size="${fitted(caption,25)}" fill="#163638">${escape(caption)}</text><text x="375" y="717" text-anchor="middle" font-family="CardBody,sans-serif" font-size="${fitted(label,28)}" fill="#163638">${escape(label)}</text></svg>`;
}
