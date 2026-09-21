const stateName = state => String(state || '').trim().toUpperCase()==='CO' ? 'Colorado' : String(state || '').trim();
export function officeRegions(offices=[]) {
 const regions=new Map();
 for(const office of offices){if(!office.city||!office.state)continue;const state=stateName(office.state);if(!regions.has(state))regions.set(state,new Set());regions.get(state).add(`${office.city}, ${office.state}`);}
 return [...regions].sort(([a],[b])=>a.localeCompare(b)).map(([state,cities])=>({state,cities:[...cities].sort()}));
}
export function serviceRegionCaption(offices=[]) {
 const regions=officeRegions(offices);
 return regions.length===1 && regions[0].state==='Colorado'?'All services offered in Colorado':regions.length?'Explore our offices in '+regions.map(r=>r.state).join(' and '):'Find the right setting for your care';
}
