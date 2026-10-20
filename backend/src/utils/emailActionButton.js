const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailButtonStyle = primary => `display:block;margin:10px 0;padding:15px 20px;border:1px solid #34734f;border-radius:10px;text-decoration:none;text-align:center;font-weight:bold;font-size:17px;line-height:1.4;background:${primary?'#34734f':'#ffffff'};color:${primary?'#ffffff':'#24563b'};`;
export function emailActionButton(label,url,primary=false) {
 return `<a href="${esc(url)}" style="${emailButtonStyle(primary)}">${esc(label)}</a>`;
}
/** Restyle existing automated CTA buttons only; leave prose and footer links intact. */
export function standardizeEmailButtons(html) {
 return typeof html !== 'string' ? html : html.replace(/<a\b[^>]*>/gi, tag => {
  const style=tag.match(/\bstyle\s*=\s*(["'])(.*?)\1/i);
  if(!style || !/\bpadding\s*:/i.test(style[2]) || !/\b(?:background(?:-color)?|border(?:-radius)?)\s*:/i.test(style[2]))return tag;
  const background=style[2].match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim();
  const primary=!!background && !/^(?:#fff(?:fff)?|white|transparent|none)(?:\s*!important)?$/i.test(background);
  return tag.replace(style[0],`style="${emailButtonStyle(primary)}"`);
 });
}
