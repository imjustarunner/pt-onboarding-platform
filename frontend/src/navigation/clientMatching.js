import { SPECIALTIES } from './providerClinicalTaxonomy.js';

// These are referral topic aliases, never diagnoses inferred from symptoms.
// NIMH: https://www.nimh.nih.gov/health/publications/depression
// Additional code labels: https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=57480
// Code families: https://spars.samhsa.gov/sites/default/files/2023-10/CMHSNOMsCodebook-10-11-2023.pdf
const aliases = [
  ['Depression', /\b(?:major depressive disorder|major depression|clinical depression|depressive disorders?|persistent depressive disorder|dysthymia|MDD)\b/gi],
  ['Mood Disorders', /\b(?:mood|affective) disorders?\b/gi],
  ['Bipolar Disorder', /\b(?:bipolar(?:\s+(?:I{1,2}|1|2))?(?:\s+(?:disorder|depression))?|manic depression)\b/gi],
  ['Anxiety', /\b(?:generalized anxiety disorder|anxiety disorders?|GAD)\b/gi],
  ['Trauma / PTSD', /\b(?:post[ -]traumatic stress disorder|PTSD|trauma)\b/gi],
  ['ADHD', /\b(?:attention[ -]deficit(?:\s*\/\s*hyperactivity|\s+hyperactivity)? disorder|ADHD)\b/gi],
  ['Obsessive-Compulsive Disorder (OCD)', /\b(?:obsessive[ -]compulsive disorder|OCD)\b/gi],
  ['Autism Spectrum / Autism Support', /\bautism(?: spectrum disorder)?\b/gi],
  ['Grief & Loss', /\b(?:grief|bereavement)\b/gi],
  ['Conduct / Oppositional Behaviors', /\boppositional defiant disorder\b/gi]
];
const parents = { Depression: ['Mood Disorders'], 'Bipolar Disorder': ['Mood Disorders'] };
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const labels = SPECIALTIES.map(label => [label, new RegExp(`\\b${escape(label)}(?=$|[^a-z0-9])`, 'gi')]);
const strings = value => Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object'
  ? [value.icd10_code || value.code, value.description || value.name || value.label].filter(Boolean).map(String)
  : value ? [String(value)] : [];

function affirmativeOccurrences(text, regex) {
  return [...text.matchAll(regex)].filter(match => {
    const clause = text.slice(0, match.index).split(/[;.!?\n]|\bbut\b/i).at(-1);
    return !/\b(?:no|not|denies|denied|without|rule out|ruled out|r\/o|family history of)\b[^;.!?\n]*$/i.test(clause);
  });
}
export function clinicalMatchingSpecialties({ diagnoses = [], presentingProblems = [] } = {}) {
  const found = new Set();
  for (const text of [...strings(diagnoses), ...strings(presentingProblems)]) {
    const recognized=aliases.flatMap(([label,pattern])=>affirmativeOccurrences(text,pattern).map(match=>({label,start:match.index,end:match.index+match[0].length})));
    for(const match of recognized)found.add(match.label);
    for(const [label,pattern] of labels)if(affirmativeOccurrences(text,pattern).some(match=>!recognized.some(alias=>match.index>=alias.start&&match.index<alias.end)))found.add(label);
  }
  // Only read codes from an explicitly supplied diagnosis, not arbitrary notes.
  for (const text of strings(diagnoses)) {
    for (const [label, pattern] of [
      ['Depression', /\bF3[23](?:\.[0-9A-Z]+)?\b/gi],
      ['Bipolar Disorder', /\bF31(?:\.[0-9A-Z]+)?\b/gi],
      ['Anxiety', /\bF41\.[019]\b/gi],
      ['Trauma / PTSD', /\bF43\.1[012]?\b/gi],
      ['ADHD', /\bF90(?:\.[01289])?\b/gi],
      ['Obsessive-Compulsive Disorder (OCD)', /\bF42\.[289]\b/gi],
      ['Autism Spectrum / Autism Support', /\bF84\.[05]\b/gi]
    ]) if (affirmativeOccurrences(text, pattern).length) found.add(label);
  }
  return [...found];
}
// A broad mood specialty covers depression/bipolar; the two specific specialties
// do not cover each other merely because they share a parent category.
export function specialtiesOverlap(needs = [], offered = []) {
  return needs.some(need => offered.some(option => need === option || parents[need]?.includes(option) || parents[option]?.includes(need)));
}
export function hasExcludedSpecialty(needs = [], excluded = []) {
  return needs.some(need => excluded.includes(need) || parents[need]?.some(parent => excluded.includes(parent)));
}
