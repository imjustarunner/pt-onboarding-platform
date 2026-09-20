// Normalize the indexed profile at its read boundary, retaining the original staff answers.
// Only recognized aliases are collapsed; narrative answers are never turned into diagnoses.
export const CLIENT_AGES = ['Toddler (0-5)', 'Children (6-10)', 'Preteen (11-13)', 'Teen (14-18)', 'Adults (18+)', 'Seniors (65+)'];
const ageAliases = [ /^(toddlers?|early childhood)(?:\s*\([^)]*\))?$/i, /^(child|children)(?:\s*\([^)]*\))?$/i, /^preteens?(?:\s*\([^)]*\))?$/i, /^(teens?|adolescents?)(?:\s*\([^)]*\))?$/i, /^adults?(?:\s*\([^)]*\))?$/i, /^(elders?|seniors?|older adults?)(?:\s*\([^)]*\))?$/i ];
export function canonicalAge(value) {
 const text=String(value||'').trim().replace(/[–—]/g,'-');
 const index=ageAliases.findIndex(re=>re.test(text));
 return index<0?null:CLIENT_AGES[index];
}
const aliases = {
 'ocd':'Obsessive-Compulsive (OCD)', 'obsessive compulsive (ocd)':'Obsessive-Compulsive (OCD)',
 'sleep/insomnia':'Sleep or Insomnia', 'sleep or insomnia':'Sleep or Insomnia',
 'education/learning disabilities':'Education and Learning Disabilities',
 'self-esteem':'Self Esteem', 'self esteem':'Self Esteem',
 'grief and loss':'Grief', 'loss':'Grief', 'behavioral concerns':'Behavioral Issues',
 'trauma-informed care':'Trauma-informed care', 'trauma informed care':'Trauma-informed care',
 'lgbtq+':'LGBTQ+', 'adhd':'ADHD'
};
const populations=/^(individuals?|couples?|families|groups|lgbtq\+|veterans|men|women|boys|girls)$/i;
const unique=values=>[...new Map(values.map(v=>[v.toLowerCase(),v])).values()];
export function facetEntries(values=[]) {
 return values.flatMap(value=>{try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed;}catch{}return [value];})
  .flatMap(value=>String(value||'').replace(/(?:^|[,;\n]\s*)\d+[.)]\s*/g, '\n').split(/[,;\n|]+/))
  .map(v=>v.trim().replace(/^[-•]\s*/,'').replace(/\.$/,'')).filter(Boolean);
}
function cleanSpecialty(value) {
 const key=value.toLowerCase();
 if(aliases[key])return aliases[key];
 // Preserve long narrative answers in the underlying profile, not in filter options.
 if(value.length>85 || /^(and |as well |or |i |my |working with )/i.test(value) || /\b(I have|I work|I support|who've|we provide)\b/i.test(value))return null;
 return value.charAt(0).toUpperCase()+value.slice(1);
}
export function normalizeClinicalFacets(facets={}) {
 const result={...facets,specialties:[],ageGroups:[],populations:[],modalities:[],interventions:[]};
 for(const group of ['specialties','ageGroups','populations','modalities','interventions']) {
  for(const value of facetEntries(facets[group]||[])) {
   const age=canonicalAge(value);
   if(age){result.ageGroups.push(age);continue;}
   if(populations.test(value)){result.populations.push(aliases[value.toLowerCase()]||value.charAt(0).toUpperCase()+value.slice(1));continue;}
   const clean=cleanSpecialty(value);
   if(clean==='Trauma-informed care'){result.modalities.push(clean);continue;}
   if(clean)result[group].push(clean);
  }
 }
 for(const group of ['specialties','ageGroups','populations','modalities','interventions'])result[group]=unique(result[group]);
 result.ageGroups.sort((a,b)=>CLIENT_AGES.indexOf(a)-CLIENT_AGES.indexOf(b));
 result.summaryTags=unique([...result.specialties.slice(0,3),...result.modalities.slice(0,2),...result.ageGroups.slice(0,2)]).slice(0,6);
 return result;
}
