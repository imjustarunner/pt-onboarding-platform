import {CLIENT_AGES, SPECIALTIES, POPULATIONS, THERAPY_APPROACHES} from '../constants/providerClinicalTaxonomy.js';
export {CLIENT_AGES};
const key = value => String(value || '').trim().replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ').toLowerCase();
const ageAliases = [/^(toddlers?|early childhood)(?:\s*\([^)]*\))?$/i,/^(child|children)(?:\s*\([^)]*\))?$/i,/^preteens?(?:\s*\([^)]*\))?$/i,/^(teens?|adolescents?)(?:\s*\([^)]*\))?$/i,/^young adults?(?:\s*\([^)]*\))?$/i,/^adults?(?:\s*\([^)]*\))?$/i,/^(elders?|seniors?|older adults?)(?:\s*\([^)]*\))?$/i];
export function canonicalAge(value) {
 const text=key(value),index=ageAliases.findIndex(re=>re.test(text));if(index<0)return null;
 const range=text.match(/\(([^)]+)\)/)?.[1];
 // Keep an explicitly different age range for review rather than silently broadening it.
 if(range&&range!==CLIENT_AGES[index].match(/\(([^)]+)\)/)?.[1])return null;
 return CLIENT_AGES[index];
}
const catalog = new Map();
for(const [group,values] of Object.entries({specialties:SPECIALTIES,populations:POPULATIONS,modalities:THERAPY_APPROACHES}))for(const value of values)catalog.set(key(value),{group,values:[value]});
function aliases(group,value,names) {for(const name of names)catalog.set(key(name),{group,values:Array.isArray(value)?value:[value]});}
aliases('specialties','Behavioral Concerns',['Behavioral Issues']);
aliases('specialties','Autism Spectrum / Autism Support',['Autism',"Asperger's Syndrome"]);
aliases('specialties','Learning Difficulties',['Education and Learning Disabilities','Education/Learning Disabilities']);
aliases('specialties','School / Academic Concerns',['School Issues']);
aliases('specialties','Self-Esteem',['Self Esteem']);
aliases('specialties','Self-Harm',['Self-Harming']);
aliases('specialties','Trauma / PTSD',['Trauma','Trauma and PTSD','Childhood trauma']);
aliases('specialties','Grief & Loss',['Grief','Grief and loss']);
aliases('specialties','Sleep Concerns',['Sleep/Insomnia','Sleep or Insomnia']);
aliases('specialties','Obsessive-Compulsive Disorder (OCD)',['OCD','Obsessive-Compulsive (OCD)']);
aliases('specialties','Conduct / Oppositional Behaviors',['ODD','Oppositional Defiance (ODD)']);
aliases('specialties','Divorce / Separation',['Divorce']);
aliases('specialties','Domestic Violence / Relationship Violence',['Domestic Violence/Abuse','Domestic abuse']);
aliases('specialties','Eating Concerns / Disordered Eating',['Eating Disorders']);
aliases('specialties','Developmental Disabilities',['Developmental Disorders']);
aliases('specialties','Impulse Control',['Chronic Impulsivity','Impulse Control Disorders']);
aliases('specialties','Relationship Concerns',['Relationship Issues']);
aliases('specialties','Sexual Abuse / Sexual Trauma',['Sexual Abuse']);
aliases('specialties','Sports Performance / Athlete Mental Health',['Sports Performance']);
aliases('specialties','Women’s Mental Health',["Women's Issues"]);
aliases('specialties','Men’s Mental Health',["Men's Issues"]);
aliases('specialties','Workplace / Career Stress',['Career Counseling']);
aliases('specialties','Perinatal / Postpartum Mental Health',['Pregnancy/Prenatal/Postpartum']);
aliases('specialties','Stress',['Stress Management']);
aliases('specialties','Anxiety',['Anxiety reduction']);
aliases('specialties','Body Image',['Positive body image']);
aliases('specialties','Life Transitions',['Life Changes']);
aliases('specialties',['Anxiety','Emotional Regulation'],['Anxiety & Emotional Regulation','anxiety and emotional regulation']);
aliases('specialties',['ADHD','Executive Functioning'],['ADHD & Executive Functioning','ADHD & Executive Functioning Support']);
aliases('specialties',['Anxiety','Depression'],['Anxiety/depression','Anxiety and depression']);
aliases('populations','Individuals',['Individual']);
aliases('populations','Parents / Caregivers',['Caregivers','Parents']);
aliases('populations','LGBTQ+ Clients',['LGBTQ+','LGBTQIA+','Bisexual','Lesbian','Bisexual Allied','Gay Allied','Lesbian Allied','Queer Allied']);
aliases('populations','Transgender / Gender-Diverse Clients',['Transgender','Transgender Allied','Non-Binary Allied']);
aliases('populations','Single-Parent Families',['Single Mother']);
aliases('modalities','Cognitive Behavioral Therapy (CBT)',['CBT']);
aliases('modalities','Dialectical Behavior Therapy (DBT)',['DBT','Dialectical Behavior (DBT)']);
aliases('modalities','Acceptance and Commitment (ACT)',['ACT']);
aliases('modalities','Trauma-informed care',['Trauma informed care','Trauma Infromed Care']);
aliases('modalities',['Cognitive Behavioral Therapy (CBT)','Dialectical Behavior Therapy (DBT)'],['CBT/DBT']);
// Retain specific, valid legacy choices rather than broadening a clinician's claimed experience.
for(const value of ['Addiction','Adoption','Alcohol Use','Antisocial Personality','Borderline Personality (BPD)','Codependency','Coping Skills','Drug Abuse','Gambling','Hoarding','Infertility','Infidelity','Life Coaching','Mood Disorders','Obesity','Racial Identity','Sex Therapy','Sexual Addiction','Spirituality','Teen Violence','Video Game Addiction','Weight Loss','Dissociative Disorders (DID)','Psychosis','Thinking Disorders','Elderly Persons Disorders','Crisis intervention','Suicide risk and safety planning'])aliases('specialties',value,[value]);
for(const value of ['Aviation Professionals','Blind Allied','Body Positivity','Cancer','Deaf Allied','HIV/AIDS Allied','Immuno-disorders','Intersex Allied','Little Person Allied','Open Relationships Non-Monogamy','Racial Justice Allied','Sex Worker Allied','Sex-Positive/Kink Allied','Sex-Positive','Kink Allied','Boys','Girls'])aliases('populations',value,[value]);
const narrative=value=>/\b(I |I’m|I'm|I've|my |don't |do not |no experience|not trained|not specialize|not in counseling|working with|who've|as well as)\b/i.test(String(value));
aliases('modalities','Cognitive Behavioral Therapy (CBT)',['Cognitive Behavioral Therapy','Cognitive Behavior Therapy']);
aliases('modalities','Person-Centered',['Person Centered']);
aliases('modalities','Strength-Based',['Strength Based']);
aliases('modalities','Narrative',['Narrative Therapy']);
aliases('modalities','CPT',['Cognitive Processing (CPT)']);
aliases('modalities','IFS',['Internal Family Systems (IFS)']);
aliases('modalities','REBT',['Rational Emotive Behavior (REBT)','Rational Emotive Behavior Therapy']);
aliases('modalities','Clinical Supervision',['Clinical Supervision and Licensed Supervisors']);
aliases('specialties',['Grief & Loss','Behavioral Concerns'],['grief and behavioral issues']);
aliases('specialties',['Substance Use','Addiction'],['Substance use/addiction']);
aliases('specialties','ADHD',['Attention-Deficit/Hyperactivity Disorder (ADHD)']);
aliases('specialties','Conduct / Oppositional Behaviors',['Oppositional Defiant Disorder (ODD)']);
aliases('specialties','Anxiety',['Anxiety disorders']);
aliases('specialties','Depression',['Depressive disorders']);
const unique=values=>[...new Map(values.map(v=>[key(v),v])).values()];
export function facetEntries(values=[]) {
 if(!Array.isArray(values))values=[values];
 return values.flatMap(value=>{try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed;if(typeof parsed==='string')return [parsed];}catch{}return [value];})
 .flatMap(value=>String(value||'').split(/\n/))
 .flatMap(value=>narrative(value)?[String(value)]:String(value||'').replace(/(?:^|\s|[,;])\d+[.)]\s*/g,'\n').split(/[,;\n|]+/))
 .map(v=>v.trim().replace(/^[-•.]\s*/,'').replace(/\.$/,'')).filter(Boolean);
}
export function normalizeClinicalFacets(facets={}) {
 const result={...facets,specialties:[],ageGroups:[],populations:[],modalities:[],interventions:[],reviewNeeded:[]};
 for(const group of ['specialties','ageGroups','populations','modalities','interventions']) {
  for(const raw of Array.isArray(facets[group])?facets[group]:[facets[group]].filter(Boolean)) {
   for(const entry of facetEntries([raw])) {
    const value=entry.replace(/^and\s+/i,'');
    if(narrative(value)){result.reviewNeeded.push({group,value:entry});continue;}
    if(/^(no|none|n\/a|not in counseling)$/i.test(value))continue;
    const age=canonicalAge(value);
    if(age){result.ageGroups.push(age);continue;}
    // Legacy compound age selections are safe only when every component is an age label.
    const ageParts=value.split('/').map(v=>canonicalAge(v));
    if(ageParts.length>1&&ageParts.every(Boolean)){result.ageGroups.push(...ageParts);continue;}
    const match=catalog.get(key(value));
    if(match){result[match.group].push(...match.values);continue;}
    result.reviewNeeded.push({group,value:entry});
   }
  }
 }
 for(const group of ['specialties','ageGroups','populations','modalities','interventions'])result[group]=unique(result[group]);
 result.ageGroups.sort((a,b)=>CLIENT_AGES.indexOf(a)-CLIENT_AGES.indexOf(b));
 result.summaryTags=unique([...result.specialties.slice(0,3),...result.modalities.slice(0,2),...result.ageGroups.slice(0,2)]).slice(0,6);
 return result;
}
