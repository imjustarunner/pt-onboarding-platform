import {addressFieldBinding} from './addressFieldBinding.js';
/** ZIP assistance is limited to a verified schema group, with no identity/DOM inference. */
export async function fillAddressGroupFromZip({field,fields,model,lookup,isCurrent=()=>true}) {
  if (!field?.key || !model) return false;
  const groups=(fields||[]).map(street=>addressFieldBinding(street,fields,model)).filter(binding=>binding?.fields.postalCode===field.key);
  if(groups.length!==1)return false;
  const raw=String(model[field.key]||''),zip=raw.replace(/\D/g,'').slice(0,5);
  if(zip.length!==5)return false;
  const found=await lookup(zip);
  if(!found || !isCurrent() || String(model[field.key]||'')!==raw)return false;
  for(const part of ['city','state']){
    const key=groups[0].fields[part];
    if(key && found[part] && !String(model[key]||'').trim())model[key]=found[part];
  }
  return true;
}
