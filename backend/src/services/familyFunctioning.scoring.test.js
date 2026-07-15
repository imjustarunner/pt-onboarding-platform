/**
 * Family Functioning scoring smoke checks (no DB).
 * Run: node backend/src/services/familyFunctioning.scoring.test.js
 */
import {
  calculateFamilyFunctioningIndex,
  calculateImportanceWeightedFamilyIndex,
  calculateFamilyOpportunityScore,
  familyFunctioningIndexLabel,
  buildFamilyFunctioningSummary,
  buildDeterministicInsights,
  matrixQuadrant
} from './familyFunctioning.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateFamilyFunctioningIndex([8, 7, 6]) === 70, 'index avg*10');
assert(calculateFamilyFunctioningIndex([null, 10]) === 100, 'null excluded');
assert(calculateFamilyFunctioningIndex([]) === null, 'empty null');
assert(
  calculateImportanceWeightedFamilyIndex([
    { currentFunctioningScore: 4, personalImportanceScore: 10 },
    { currentFunctioningScore: 8, personalImportanceScore: 5 }
  ]) === 53,
  'weighted index'
);
assert(calculateFamilyOpportunityScore(4, 9, 8) === 7.75, 'opportunity');
assert(familyFunctioningIndexLabel(72) === 'Strong Foundation With Clear Priorities', 'label');
assert(matrixQuadrant(8, 9) === 'core-strengths', 'quadrant strength');
assert(matrixQuadrant(4, 9) === 'high-value-support', 'quadrant support');

const template = {
  settings: {},
  domains: [
    {
      key: 'communication',
      label: 'Communication',
      shortLabel: 'Communication',
      color: '#475569',
      familySystem: 'communication-and-safety',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'respect',
      label: 'Respect',
      shortLabel: 'Respect',
      color: '#64748B',
      familySystem: 'communication-and-safety',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'emotional_safety',
      label: 'Emotional Safety',
      shortLabel: 'Safety',
      color: '#1D4ED8',
      familySystem: 'communication-and-safety',
      isActive: true,
      isSensitive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'routines',
      label: 'Routines',
      shortLabel: 'Routines',
      color: '#A16207',
      familySystem: 'structure-and-cooperation',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'teamwork',
      label: 'Teamwork',
      shortLabel: 'Teamwork',
      color: '#3F6212',
      familySystem: 'structure-and-cooperation',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'connection',
      label: 'Connection',
      shortLabel: 'Connection',
      color: '#0F766E',
      familySystem: 'connection-and-enjoyment',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'fun',
      label: 'Fun',
      shortLabel: 'Fun',
      color: '#C2410C',
      familySystem: 'connection-and-enjoyment',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    },
    {
      key: 'flexibility',
      label: 'Flexibility',
      shortLabel: 'Flexibility',
      color: '#7C3AED',
      familySystem: 'adaptability',
      isActive: true,
      participantVersions: ['general-household'],
      availableModes: ['full']
    }
  ]
};

const summary = buildFamilyFunctioningSummary(template, [
  {
    domainKey: 'communication',
    currentFunctioningScore: 9,
    personalImportanceScore: 9,
    supportNeedScore: 3
  },
  {
    domainKey: 'respect',
    currentFunctioningScore: 8,
    personalImportanceScore: 8,
    supportNeedScore: 3
  },
  {
    domainKey: 'emotional_safety',
    currentFunctioningScore: 3,
    personalImportanceScore: 10,
    supportNeedScore: 9
  },
  {
    domainKey: 'routines',
    currentFunctioningScore: 9,
    personalImportanceScore: 8,
    supportNeedScore: 2
  },
  {
    domainKey: 'teamwork',
    currentFunctioningScore: 8,
    personalImportanceScore: 7,
    supportNeedScore: 3
  },
  {
    domainKey: 'connection',
    currentFunctioningScore: 8,
    personalImportanceScore: 8,
    supportNeedScore: 3
  },
  {
    domainKey: 'fun',
    currentFunctioningScore: 7,
    personalImportanceScore: 6,
    supportNeedScore: 4
  },
  {
    domainKey: 'flexibility',
    currentFunctioningScore: 8,
    personalImportanceScore: 7,
    supportNeedScore: 3
  }
]);

assert(summary.familyFunctioningIndex != null, 'summary index');
assert(summary.familyFunctioningIndex >= 70, 'high overall with low safety still scores high overall');
assert(summary.strengths.some((x) => x.domainKey === 'communication'), 'strengths');
assert(
  summary.highValueSupportAreas.some((x) => x.domainKey === 'emotional_safety'),
  'emotional safety as high-value support'
);
assert(
  summary.insights.some((t) => t.toLowerCase().includes('emotional safety')),
  'emotional safety insight not hidden by high overall'
);
assert(
  summary.insights.some(
    (t) =>
      t.toLowerCase().includes('overall') ||
      t.toLowerCase().includes('high index') ||
      t.toLowerCase().includes('still deserves')
  ),
  'high-index + low safety elevated insight'
);
assert(!summary.insights.join(' ').toLowerCase().includes('dysfunctional'), 'no dysfunction labels');
assert(!summary.insights.join(' ').toLowerCase().includes('unfit'), 'no fitness language');
assert(!summary.insights.join(' ').toLowerCase().includes('custody'), 'no custody language');
assert(
  !/\bis abuse\b|\bproves abuse\b|\bindicates abuse\b/i.test(summary.insights.join(' ')),
  'does not conclude abuse from low scores'
);

const insights = buildDeterministicInsights([
  {
    domainKey: 'emotional_safety',
    label: 'Emotional Safety',
    currentFunctioningScore: 3,
    personalImportanceScore: 9,
    supportNeedScore: 9
  },
  {
    domainKey: 'communication',
    label: 'Communication',
    currentFunctioningScore: 8,
    personalImportanceScore: 8,
    supportNeedScore: 3
  }
]);
assert(
  insights.some((t) => t.toLowerCase().includes('emotional safety')),
  'emotional safety + communication insight'
);
assert(
  insights.some((t) => t.toLowerCase().includes('family meetings') || t.toLowerCase().includes('confidential')),
  'safety path avoids naive family-meeting advice'
);

console.log('familyFunctioning.scoring.test.js: all checks passed');
