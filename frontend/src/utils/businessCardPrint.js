import { AVERY_35702, cardPositions, cardSvg, svgDataUrl } from './businessCards';
import { cardBackSvg } from './businessCardBack';
const escape = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function printSettingsDefaults(agency = {}) {
  const itsco = String(agency.slug || '').toLowerCase() === 'itsco';
  return { offsetX:0, offsetY:0, topRowOffsetY:itsco ? 0.0625 : 0, backOffsetX:0, backOffsetY:0, bleed:.0625, bottomBleed:itsco ? 0.09375 : 0.0625 };
}
export function normalizePrintSettings(raw = {}) {
  const settings = { ...printSettingsDefaults(), ...raw };
  for(const key of ['offsetX','offsetY','topRowOffsetY','backOffsetX','backOffsetY','bleed','bottomBleed']) {
    const value = settings[key];
    if(!Number.isFinite(value)||Math.abs(value)>.125||(['bleed','bottomBleed'].includes(key)&&value<0))throw new Error('Print adjustments must be within 1/8 inch; bleed cannot be negative.');
  }
  if(!['front','back','both'].includes(settings.side || 'front'))throw new Error('Choose front, back, or both sides.');
  return settings;
}
export function cardPrintPositions(raw = {}, back = false) {
  const s=normalizePrintSettings(raw);
  return cardPositions(s.offsetX,s.offsetY).map((p,i)=>{
    let x=p.x,y=p.y+(i<3?s.topRowOffsetY:0);
    if(back){x=AVERY_35702.width-x-AVERY_35702.card+s.backOffsetX;y+=s.backOffsetY;}
    if(x-s.bleed<0||x+AVERY_35702.card+s.bleed>AVERY_35702.width||y-s.bleed<0||y+AVERY_35702.card+s.bottomBleed>AVERY_35702.height)throw new Error('These combined printer adjustments place artwork outside the Letter page. Reduce the offsets or bleed.');
    return{x,y};
  });
}
export function cardSheetPlan(cards, raw = {}, fonts = {}) {
  const s=normalizePrintSettings(raw),side=s.side||'front';
  return cards.flatMap(card=>(side==='both'?['front','back']:[side]).map(face=>({
    name:card.name,face,positions:cardPrintPositions(s,face==='back'),
    svg:(face==='back'?cardBackSvg:cardSvg)(card,fonts,s.bleed,s.bottomBleed)
  })));
}
export function printableCardsHtml(cards, options = {}, fonts = {}) {
  const s=normalizePrintSettings(options),width=2.5+2*s.bleed,height=2.5+s.bleed+s.bottomBleed;
  const sheets=cardSheetPlan(cards,s,fonts);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Business cards · Avery 35702</title><style>@page{size:8.5in 11in;margin:0}*{box-sizing:border-box}body{margin:0;background:#e7eceb;font-family:Arial,sans-serif}nav{padding:20px;text-align:center}button{padding:10px 18px;cursor:pointer}.sheet{position:relative;width:8.5in;height:11in;margin:20px auto;background:white;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.card{position:absolute;width:2.5in;height:2.5in}.card img{display:block;position:absolute;left:-${s.bleed}in;top:-${s.bleed}in;width:${width}in;height:${height}in}${s.guides?'.card::after{content:"";position:absolute;inset:0;border:.5pt dashed #666}':''}@media print{body{background:white}nav{display:none}.sheet{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><nav><button onclick="window.print()">Print / Save as PDF</button><p>Letter · Portrait · Actual size / 100% · No margins · Headers and footers off.</p><p>${s.side==='both'?'Front and back pages alternate for each employee. Print two-sided, flip on the long edge.':'Nine matching cards per page.'} Test alignment on plain paper first.</p></nav>${sheets.map(sheet=>`<section class="sheet" data-side="${sheet.face}" aria-label="${escape(sheet.name)} — ${sheet.face}">${sheet.positions.map(p=>`<div class="card" style="left:${p.x}in;top:${p.y}in"><img alt="${escape(sheet.name)}" src="${escape(svgDataUrl(sheet.svg))}"></div>`).join('')}</section>`).join('')}</body></html>`;
}
