import QRCode from 'qrcode';
import { safeLogo, safeColor, cardLogoMarkup, singleLine, textBlock, ink, contactIcon } from './businessCards';
import { cardQrUrl } from './businessCardBack';
const escape = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fontStyle = fonts => [['heading','CardHeading',700],['body','CardBody',400]].map(([key,family,weight]) => /^data:font\/ttf;base64,[a-z0-9+/=]+$/i.test(fonts[key] || '') ? `@font-face{font-family:${family};src:url('${fonts[key]}') format('truetype');font-weight:${weight};}` : '').join('');
const frame = (content, fonts, face) => `<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="600" viewBox="0 0 1050 600" data-card-format="8870" data-card-face="${face}"><metadata>${escape(fonts.licenses)}</metadata><style>${fontStyle(fonts)}</style><rect width="1050" height="600" fill="white"/>${content}</svg>`;
// 8870 cards share cut lines. The deliberate white frame keeps neighboring inks separate.
export function rectangleCardSvg(card, fonts = {}) {
  const primary = safeColor(card.primary,'#a1dce1'), accent = safeColor(card.accent,'#b9d84e');
  const primaryInk = safeColor(card.primaryText,ink(primary)), accentInk = safeColor(card.accentText,ink(accent));
  const line = (value,x,y,width,size,color,weight=400,field='') => singleLine(value,x,y,width,size,color,weight,weight===700?'CardHeading':'CardBody',fonts.measure,field);
  const block = (value,x,y,width,size,maxLines,color,weight=400) => textBlock(value,x,y,width,size,maxLines,color,weight,weight===700?'CardHeading':'CardBody',fonts.measure);
  const credentials = card.credentials ? line(card.credentials,52,151,514,28,primaryInk,700,'credentials') : '';
  const title = block(card.title,52,credentials?192:157,514,27,3,primaryInk);
  let identity = `${line(card.name,52,106,514,43,primaryInk,700,'name')}${credentials}${title.markup}`;
  if (['organization', 'group', 'department'].includes(card.kind)) {
    let size = card.kind === 'organization' ? 100 : 64;
    const widestWord = Math.max(1, ...String(card.name || '').split(/\s+/).map(word => fonts.measure
      ? fonts.measure(word,size,'CardHeading',700) : word.length*size*.6));
    size = Math.min(size,size*514/widestWord);
    let name, sharedCredentials, sharedTitle, height;
    do {
      const rows = [];
      for (const word of String(card.name || '').trim().split(/\s+/).filter(Boolean)) {
        const candidate = rows.length ? `${rows[rows.length-1]} ${word}` : word;
        const width = fonts.measure ? fonts.measure(candidate,size,'CardHeading',700) : candidate.length*size*.6;
        if (rows.length && width <= 514) rows[rows.length-1] = candidate;
        else rows.push(word);
      }
      name = block(rows.join('\n'),52,size*.8,514,size,rows.length,primaryInk,700);
      sharedCredentials = block(card.credentials,52,name.bottom+34,514,28,1,primaryInk,700);
      sharedTitle = block(card.title,52,(sharedCredentials.lines?sharedCredentials.bottom:name.bottom)+38,514,27,3,primaryInk);
      height = (sharedTitle.lines?sharedTitle.bottom:sharedCredentials.lines?sharedCredentials.bottom:name.bottom)+8;
      if (height <= 206 || size <= 15) break;
      size -= 1;
    } while (true);
    identity = `<g transform="translate(0 ${22+(258-height)/2})"><g data-card-field="name">${name.markup}</g>${sharedCredentials.markup}${sharedTitle.markup}</g>`;
  }
  const extension = String(card.extension || '').replace(/^(?:extension|ext\.?|x)\s*[:#.-]?\s*/i,'');
  const phone = card.phone ? `${card.phone}${extension ? ` ext. ${extension}` : ''}` : '';
  const work = card.workLine?.number && (card.workLine.canCall || card.workLine.canText) ? card.workLine : null;
  const workLabel = work?.canCall ? (work.canText ? 'Call / Text' : 'Call') : 'Text';
  const number = String(work?.number || '').replace(/^\+?1?(\d{3})(\d{3})(\d{4})$/,'$1-$2-$3');
  const rows = [['office',phone,'office-phone'],['phone',work?`${number} ${workLabel}`:'','work-phone'],['email',String(card.email||'').replace(/@itsco\.health$/i,'@ITSCO.health'),'email'],['website',card.website,'website']].filter(([,value])=>value);
  const start = 430 - (rows.length-1)*27;
  const contacts = rows.map(([icon,value,field],i)=>`<g data-card-contact="${field}">${contactIcon(icon,52,start+i*54-25,28)}${line(value,95,start+i*54,465,28,'#162f32',400,field)}</g>`).join('');
  const addressText = String(card.address || '').replace(/\b(\d{5})-\d{4}\b/g,'$1');
  const address = block(addressText,638,0,350,28,6,accentInk);
  if (address.bottom > 205) throw new Error('The office address is too long for a rectangle card. Choose one office or shorten the address.');
  const addressTop = 420 - (54 + address.bottom)/2;
  const watermark = safeLogo(card.watermarkLogo);
  const watermarkMarkup = cardLogoMarkup(watermark?{logo:watermark}:card,80,180,850,430,'opacity="0.07" data-card-watermark="logo"');
  return frame(`<defs><clipPath id="rectangle-front-trim"><rect x="22" y="22" width="1006" height="556"/></clipPath></defs>
    <g clip-path="url(#rectangle-front-trim)"><rect x="22" y="22" width="1006" height="556" fill="#f6f7f4"/>
    <rect data-card-panel="name-color" x="22" y="22" width="578" height="258" fill="${primary}"/>
    <rect data-card-panel="address-color" x="600" y="280" width="428" height="298" fill="${accent}"/>
    ${watermarkMarkup}<rect x="600" y="22" width="428" height="258" fill="#f6f7f4"/>
    <g data-card-panel="identity">${identity}</g>
    ${safeLogo(card.logo)?cardLogoMarkup(card,644,51,340,200,'data-card-panel="logo"'):block(card.organization,640,125,350,36,3,'#163638',700).markup}
    ${contacts}${addressText?`<g data-card-panel="address" transform="translate(0 ${addressTop})">${contactIcon('location',638,-18,25,accentInk)}${line(/\n\s*\n/.test(addressText)?'OFFICE LOCATIONS':'OFFICE LOCATION',673,3,315,23,accentInk,700,'office-label')}<g transform="translate(0 54)">${address.markup}</g></g>`:''}</g>`,fonts,'front');
}

export function rectangleCardBackSvg(card, fonts = {}) {
  const url = cardQrUrl(card), qr = QRCode.create(url,{errorCorrectionLevel:'H'});
  const n=qr.modules.size, size=390, module=size/(n+8), left=610+4*module, top=75+4*module;
  const finder=(r,c)=>(r<7&&(c<7||c>=n-7))||(r>=n-7&&c<7);
  const dots=[];
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(qr.modules.get(r,c)&&!finder(r,c)) {
    const x=left+c*module,y=top+r*module;
    dots.push(qr.modules.isReserved(r,c)?`<rect x="${x}" y="${y}" width="${module}" height="${module}"/>`:`<circle cx="${x+module/2}" cy="${y+module/2}" r="${module*.49}"/>`);
  }
  const eyes=[[0,0],[n-7,0],[0,n-7]].map(([c,r])=>{const x=left+c*module,y=top+r*module;return `<rect x="${x}" y="${y}" width="${7*module}" height="${7*module}" rx="${module}" fill="#163638"/><rect x="${x+module}" y="${y+module}" width="${5*module}" height="${5*module}" rx="${module*.6}" fill="white"/><rect x="${x+2*module}" y="${y+2*module}" width="${3*module}" height="${3*module}" rx="${module*.4}" fill="#163638"/>`;}).join('');
  const primary=safeColor(card.primary,'#a1dce1'),accent=safeColor(card.accent,'#b9d84e'),color=safeColor(card.primaryText,ink(primary));
  const label=String(card.backWebsite||card.website||new URL(url).hostname).replace(/^https?:\/\//,'').replace(/\/$/,'');
  const labelLine=(text,x,y,width,size,fill,weight=400)=>`<g transform="translate(${x} 0)">${singleLine(text,0,y,width,size,fill,weight,weight===700?'CardHeading':'CardBody',fonts.measure,'back-label')}</g>`;
  return frame(`<rect x="22" y="22" width="535" height="556" rx="8" fill="${primary}"/>
    <rect x="22" y="550" width="535" height="28" fill="${accent}"/>
    <rect x="52" y="68" width="475" height="278" rx="18" fill="white"/>
    ${safeLogo(card.logo)?cardLogoMarkup(card,78,89,423,236,'data-card-panel="agency-logo"'):textBlock(card.organization,79,177,421,44,3,'#163638',700,'CardHeading',fonts.measure).markup}
    ${labelLine(card.organization,54,411,465,32,color,700)}${labelLine(label,54,461,465,28,color)}
    <g data-card-panel="qr" data-qr-url="${escape(url)}"><rect x="610" y="75" width="390" height="390" fill="white"/><g fill="#163638">${dots.join('')}</g>${eyes}</g>
    ${labelLine(card.backCaption||'Explore our website',610,519,390,25,'#163638')}`,fonts,'back');
}
