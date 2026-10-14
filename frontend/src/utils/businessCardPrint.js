import { cardSvg, svgDataUrl } from './businessCards';
import { cardBackSvg } from './businessCardBack';
import { businessCardLayout } from './businessCardLayouts';
import { rectangleCardSvg, rectangleCardBackSvg } from './businessCardRectangle';
export function renderCardFace(card, face, format = '35702', fonts = {}, bleed = 0, bottomBleed = bleed) {
  const rectangle = businessCardLayout(format).id === '8870';
  return (rectangle ? (face === 'back' ? rectangleCardBackSvg : rectangleCardSvg) : (face === 'back' ? cardBackSvg : cardSvg))(card, fonts, bleed, bottomBleed);
}
const escape = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function printSettingsDefaults(agency = {}, format = '35702') {
  if (businessCardLayout(format).id === '8870') return { offsetX:0, offsetY:0, topRowOffsetY:0, backOffsetX:0, backOffsetY:0, bleed:0, bottomBleed:0 };
  const itsco = String(agency.slug || '').toLowerCase() === 'itsco';
  return { offsetX:0, offsetY:0, topRowOffsetY:itsco ? 0.0625 : 0, backOffsetX:0, backOffsetY:0, bleed:.0625, bottomBleed:itsco ? 0.09375 : 0.0625 };
}
export function normalizePrintSettings(raw = {}) {
  const layout = businessCardLayout(raw.format);
  const settings = { ...printSettingsDefaults({}, layout.id), ...raw, format: layout.id };
  if (layout.id === '8870' && (settings.bleed || settings.bottomBleed || settings.topRowOffsetY)) throw new Error('Avery 8870 cards share cut lines: use zero bleed and adjust the whole sheet, not individual rows.');
  for(const key of ['offsetX','offsetY','topRowOffsetY','backOffsetX','backOffsetY','bleed','bottomBleed']) {
    const value = settings[key];
    if(!Number.isFinite(value)||Math.abs(value)>.125||(['bleed','bottomBleed'].includes(key)&&value<0))throw new Error('Print adjustments must be within 1/8 inch; bleed cannot be negative.');
  }
  if(!['front','back','both'].includes(settings.side || 'front'))throw new Error('Choose front, back, or both sides.');
  return settings;
}
export function cardPrintPositions(raw = {}, back = false) {
  const s=normalizePrintSettings(raw), t=businessCardLayout(s.format);
  return Array.from({length:t.count},(_,i)=>{
    let x=t.left+(i%t.columns)*t.pitchX+s.offsetX;
    let y=t.top+Math.floor(i/t.columns)*t.pitchY+s.offsetY+(i<t.columns?s.topRowOffsetY:0);
    if(back){x=t.width-x-t.cardWidth+s.backOffsetX;y+=s.backOffsetY;}
    if(x-s.bleed<0||x+t.cardWidth+s.bleed>t.width||y-s.bleed<0||y+t.cardHeight+s.bottomBleed>t.height)throw new Error('These combined printer adjustments place artwork outside the Letter page. Reduce the offsets or bleed.');
    return{x,y};
  });
}

export function cardSheetPlan(cards, raw = {}, fonts = {}) {
  const s=normalizePrintSettings(raw),side=s.side||'front';
  return cards.flatMap(card=>(side==='both'?['front','back']:[side]).map(face=>({
    name:card.name,face,positions:cardPrintPositions(s,face==='back'),
    svg:renderCardFace(card,face,s.format,fonts,s.bleed,s.bottomBleed)
  })));
}
export function printableCardsHtml(cards, options = {}, fonts = {}) {
  const s=normalizePrintSettings(options),t=businessCardLayout(s.format),width=t.cardWidth+2*s.bleed,height=t.cardHeight+s.bleed+s.bottomBleed;
  const sheets=cardSheetPlan(cards,s,fonts);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Business cards · Avery ${t.id}</title><style>@page{size:8.5in 11in;margin:0}*{box-sizing:border-box}body{margin:0;background:#e7eceb;font-family:Arial,sans-serif}nav{padding:20px;text-align:center}button{padding:10px 18px;cursor:pointer}.sheet{position:relative;width:8.5in;height:11in;margin:20px auto;background:white;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.card{position:absolute;width:${t.cardWidth}in;height:${t.cardHeight}in}.card img{display:block;position:absolute;left:-${s.bleed}in;top:-${s.bleed}in;width:${width}in;height:${height}in}${s.guides?'.card::after{content:"";position:absolute;inset:0;border:.5pt dashed #666}':''}@media print{body{background:white}nav{display:none}.sheet{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><nav><button onclick="window.print()">Print / Save as PDF</button><p>Letter · Portrait · Actual size / 100% · No margins · Headers and footers off.</p><p>${s.side==='both'?'Front and back pages alternate for each employee. Print two-sided, flip on the long edge.':`${t.count} matching cards per page.`} Test alignment on plain paper first.</p></nav>${sheets.map(sheet=>`<section class="sheet" data-side="${sheet.face}" aria-label="${escape(sheet.name)} — ${sheet.face}">${sheet.positions.map(p=>`<div class="card" style="left:${p.x}in;top:${p.y}in"><img alt="${escape(sheet.name)}" src="${escape(svgDataUrl(sheet.svg))}"></div>`).join('')}</section>`).join('')}</body></html>`;
}
