export function uniquePublicFacets(values=[]) {
 const groups=new Map();
 for(const raw of values){const value=String(raw||'').trim();if(!value)continue;
  const key=value.toLowerCase().replace(/[–—]/g,'-').replace(/\s*\([^)]*\)/g,'').replace(/\s+/g,' ').replace(/^children?$/,'children').replace(/^preteens?$/,'preteen').replace(/^teens?$/,'teen').replace(/^adults?$/,'adult').replace(/^toddlers?$/,'toddler');
  if(!groups.has(key)||value.includes('(')&&!groups.get(key).includes('('))groups.set(key,value);
 }
 return [...groups.values()];
}

// Keep age facets in developmental order, independent of provider response order.
export function sortClientAges(values = []) {
 const order = value => {
  const label = String(value).toLowerCase();
  if (/toddler|infant|preschool/.test(label)) return 0;
  if (/preteen/.test(label)) return 11;
  if (/children|^child/.test(label)) return 6;
  if (/teen|adolescent/.test(label)) return 14;
  if (/young adult/.test(label)) return 18;
  if (/senior|elder|older adult/.test(label)) return 65;
  if (/adult/.test(label)) return 26;
  return Number(label.match(/\d+/)?.[0] || 999);
 };
 return uniquePublicFacets(values).sort((a,b)=>order(a)-order(b)||a.localeCompare(b));
}
