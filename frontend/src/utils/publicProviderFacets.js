export function uniquePublicFacets(values=[]) {
 const groups=new Map();
 for(const raw of values){const value=String(raw||'').trim();if(!value)continue;
  const key=value.toLowerCase().replace(/[–—]/g,'-').replace(/\s*\([^)]*\)/g,'').replace(/\s+/g,' ').replace(/^children?$/,'children').replace(/^preteens?$/,'preteen').replace(/^teens?$/,'teen').replace(/^adults?$/,'adult').replace(/^toddlers?$/,'toddler');
  if(!groups.has(key)||value.includes('(')&&!groups.get(key).includes('('))groups.set(key,value);
 }
 return [...groups.values()];
}
