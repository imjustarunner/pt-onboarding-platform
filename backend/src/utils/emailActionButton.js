import {buttonTextColor} from './agencyBrandColor.js';
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailButtonStyle = (primary,color='#34734f') => `display:block;margin:10px 0;padding:15px 20px;border:1px solid ${color};border-radius:10px;text-decoration:none;text-align:center;font-weight:bold;font-size:17px;line-height:1.4;background:${primary?color:'#ffffff'};color:${primary?buttonTextColor(color):buttonTextColor(color)==='#ffffff'?color:'#111827'};`;
export function emailActionButton(label,url,primary=false) {
 return `<a href="${esc(url)}" data-email-action="${primary?'primary':'secondary'}" style="${emailButtonStyle(primary)}">${esc(label)}</a>`;
}
/** Restyle existing automated CTA buttons only; leave prose and footer links intact. */
export function standardizeEmailButtons(html, color='#34734f') {
 if(!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(color)))color='#34734f';
 return typeof html !== 'string' ? html : html.replace(/<a\b[^>]*>/gi, tag => {
  if (/\bdata-appointment-action="(?:primary|secondary)"/.test(tag)) return tag;
  const style=tag.match(/\bstyle\s*=\s*(["'])(.*?)\1/i);
  if(!style || !/\bpadding\s*:/i.test(style[2]) || !/\b(?:background(?:-color)?|border(?:-radius)?)\s*:/i.test(style[2]))return tag;
  const background=style[2].match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim();
  const action=tag.match(/\bdata-email-action="(primary|secondary)"/)?.[1];
  const primary=action ? action==='primary' : !!background && !/^(?:#fff(?:fff)?|white|transparent|none)(?:\s*!important)?$/i.test(background);
  const updated=tag.replace(style[0],`style="${emailButtonStyle(primary,color)}"`);
  return action ? updated : updated.replace(/>$/,` data-email-action="${primary?'primary':'secondary'}">`);
 });
}
