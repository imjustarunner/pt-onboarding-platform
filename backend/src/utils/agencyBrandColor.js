const hex = value => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(value || '')) ? value : null;
export function agencyActionColor(agency) {
  let palette=agency?.color_palette || {};
  if(typeof palette==='string'){try{palette=JSON.parse(palette);}catch{palette={};}}
  const nlu=String(agency?.slug || agency?.portal_url || '').toLowerCase()==='nlu' || agency?.name==='Next Level Up';
  return hex(palette.emailButton) || (nlu && hex(palette.secondary)) || hex(palette.primary) || '#34734f';
}
export function buttonTextColor(color) {
  const full=color.length===4 ? '#'+color.slice(1).split('').map(c=>c+c).join('') : color;
  const channels=[1,3,5].map(i=>parseInt(full.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  return luminance>.179 ? '#111827' : '#ffffff';
}
