// Explicit configured slugs only; never infer a tenant from its display name.
import {isNluTutoringQaAgency} from '../utils/nluTutoringQaPolicy.js';

export function handbookTenant(agency) {
  const slug = String(agency?.slug || '').toLowerCase();
  if (slug === 'itsco') return 'itsco';
  if (['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'].includes(slug)) return 'nlu';
  let flags=agency?.feature_flags||{};
  if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
  if(isNluTutoringQaAgency(agency)&&Number(flags.qaSandbox?.sourceAgencyId)===6)return 'nlu';
  if (['tisi', 'innerstrength', 'inner-strength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'].includes(slug)) return 'isi';
  return null;
}
