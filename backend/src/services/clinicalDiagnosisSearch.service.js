import {readFileSync} from 'node:fs';
import {diagnosisCatalogForDate} from './clinicalDiagnosisCatalog.js';

const data=JSON.parse(readFileSync(new URL('../data/icd10cm-descriptions.json',import.meta.url),'utf8'));
const normalize=value=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={gad:'generalized anxiety',adhd:'attention deficit hyperactivity',add:'attention deficit',ptsd:'post traumatic stress',ocd:'obsessive compulsive',asd:'autistic disorder'};
const cache=new Map();
function edition(date) {
 const catalog=diagnosisCatalogForDate(date);
 if(!catalog)throw Object.assign(new Error('No ICD-10-CM edition is loaded for this service date.'),{status:422});
 if(!cache.has(catalog.effectiveFrom)) {
  const release=data.releases.find(r=>r.effectiveFrom===catalog.effectiveFrom);
  const descriptions={...data.baseDescriptions,...release.descriptions};
  const rows=[...catalog.codes].map(code=>({code,description:descriptions[code],normalized:normalize(descriptions[code]),codeKey:code.replace('.','').toLowerCase(),words:normalize(descriptions[code]).split(' ')}));
  if(rows.some(row=>!row.description))throw Object.assign(new Error('The diagnosis description catalog is incomplete.'),{status:503});
  cache.set(catalog.effectiveFrom,{catalog,rows,vocabulary:[...new Set(rows.flatMap(row=>row.words))]});
 }
 return cache.get(catalog.effectiveFrom);
}
// Bounded Damerau-Levenshtein: supports common misspellings/transpositions while
// returning only real codes from the selected CMS edition, never generated text.
function distance(a,b,limit) {
 if(Math.abs(a.length-b.length)>limit)return limit+1;
 let previous=Array.from({length:b.length+1},(_,i)=>i),before=previous;
 for(let i=1;i<=a.length;i++) {
  const current=[i];let minimum=i;
  for(let j=1;j<=b.length;j++) {
   current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])current[j]=Math.min(current[j],before[j-2]+1);
   minimum=Math.min(minimum,current[j]);
  }
  if(minimum>limit)return limit+1;
  before=previous;previous=current;
 }
 return previous[b.length];
}
export function searchClinicalDiagnoses(query,{dateOfService,limit=12}={}) {
 const date=dateOfService || new Date().toISOString().slice(0,10);
 const {catalog,rows,vocabulary}=edition(date);
 const entered=normalize(query).slice(0,100),terms=(aliases[entered] || entered).split(/\s+/).filter(Boolean);
 if(entered.length<2)return {items:[],edition:{effectiveFrom:catalog.effectiveFrom,effectiveThrough:catalog.effectiveThrough}};
 const codeKey=entered.replace(/\s/g,''),ranked=[],similar=new Map();
 for(const row of rows) {
  let rank=row.codeKey===codeKey?0:row.codeKey.startsWith(codeKey)?5:null;
  if(rank===null) {
   const words=row.words;let total=0,matched=true;
   for(const term of terms) {
    if(words.includes(term))continue;
    if(words.some(word=>word.startsWith(term))){total+=1;continue;}
    if(row.normalized.includes(term)){total+=3;continue;}
    const tolerance=term.length>=7?2:term.length>=4?1:0;
    if(tolerance&&!similar.has(term))similar.set(term,new Set(vocabulary.filter(word=>distance(term,word,tolerance)<=tolerance)));
    if(tolerance&&words.some(word=>similar.get(term).has(word))){total+=8;continue;}
    matched=false;break;
   }
   if(matched)rank=20+total;
  }
  // This is a behavioral-health picker: comparable text matches from chapter F
  // appear first; exact/prefix code searches still take precedence for all codes.
  if(rank!==null)ranked.push({row,rank:rank>=20?rank-(row.code.startsWith('F')?4:0)-(row.normalized.startsWith(terms[0])?1:0):rank});
 }
 ranked.sort((a,b)=>a.rank-b.rank||Number(!a.row.code.startsWith('F'))-Number(!b.row.code.startsWith('F'))||a.row.description.length-b.row.description.length||a.row.code.localeCompare(b.row.code));
 return {items:ranked.slice(0,Math.max(1,Math.min(20,Number(limit)||12))).map(({row})=>({code:row.code,description:row.description})),edition:{effectiveFrom:catalog.effectiveFrom,effectiveThrough:catalog.effectiveThrough}};
}
