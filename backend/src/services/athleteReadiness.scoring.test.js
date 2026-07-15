/**
 * Lightweight scoring smoke test for Athlete Readiness.
 * Run: node backend/src/services/athleteReadiness.scoring.test.js
 */
import {
  calculateAthleteReadinessScore,
  readinessStatusLabel,
  dailyRecommendation,
  buildSummary
} from './athleteReadiness.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  const inputs = [
    { score: 10, weight: 12 },
    { score: 10, weight: 15 },
    { score: 10, weight: 12 },
    { score: 10, weight: 12 },
    { score: 10, weight: 10 },
    { score: 10, weight: 10 },
    { score: 10, weight: 8 },
    { score: 10, weight: 8 },
    { score: 10, weight: 7 },
    { score: 10, weight: 6 }
  ];
  assert(calculateAthleteReadinessScore(inputs) === 100, 'all 10s should be 100');
}

{
  const score = calculateAthleteReadinessScore([
    { score: 5, weight: 50 },
    { score: 10, weight: 50 }
  ]);
  assert(score === 75, `expected 75 got ${score}`);
}

assert(calculateAthleteReadinessScore([]) === null, 'empty → null');
assert(calculateAthleteReadinessScore([{ score: 5, weight: 0 }]) === null, 'zero weight → null');

assert(readinessStatusLabel(72) === 'Ready', 'athlete status Ready');
assert(readinessStatusLabel(90) === 'Highly Ready', 'athlete status Highly Ready');
assert(readinessStatusLabel(30, false) === 'Significant Support Needed', 'coach status');

assert(dailyRecommendation(88).status === 'High Readiness', 'rec high');
assert(dailyRecommendation(50).status === 'Support Recommended', 'rec support');

const template = {
  domains: [
    { key: 'sleep', label: 'Sleep', shortLabel: 'Sleep', weight: 12, readinessLayer: 'recovery', color: '#0EA5E9', availableModes: ['daily'] },
    { key: 'recovery', label: 'Recovery', shortLabel: 'Recovery', weight: 15, readinessLayer: 'recovery', color: '#0284C7', availableModes: ['daily'] },
    { key: 'energy', label: 'Energy', shortLabel: 'Energy', weight: 12, readinessLayer: 'physical', color: '#22C55E', availableModes: ['daily'] },
    { key: 'soreness', label: 'Soreness', shortLabel: 'Soreness', weight: 12, readinessLayer: 'physical', color: '#84CC16', availableModes: ['daily'] },
    { key: 'focus', label: 'Focus', shortLabel: 'Focus', weight: 10, readinessLayer: 'mental', color: '#8B5CF6', availableModes: ['daily'] },
    { key: 'confidence', label: 'Confidence', shortLabel: 'Confidence', weight: 10, readinessLayer: 'emotional', color: '#A855F7', availableModes: ['daily'] },
    { key: 'motivation', label: 'Motivation', shortLabel: 'Motivation', weight: 8, readinessLayer: 'mental', color: '#EC4899', availableModes: ['daily'] },
    { key: 'stress', label: 'Stress', shortLabel: 'Stress', weight: 8, readinessLayer: 'emotional', color: '#F59E0B', availableModes: ['daily'] },
    { key: 'nutrition', label: 'Nutrition', shortLabel: 'Nutrition', weight: 7, readinessLayer: 'physical', color: '#14B8A6', availableModes: ['daily'] },
    { key: 'connection', label: 'Connection', shortLabel: 'Connection', weight: 6, readinessLayer: 'competitive', color: '#6366F1', availableModes: ['daily'] },
    { key: 'competition', label: 'Compete', shortLabel: 'Compete', weight: 0, readinessLayer: 'competitive', color: '#EF4444', isOptional: true, availableModes: ['competition'] }
  ]
};

const responses = [
  { domainKey: 'sleep', score: 8 },
  { domainKey: 'recovery', score: 4 },
  { domainKey: 'energy', score: 7 },
  { domainKey: 'soreness', score: 3 },
  { domainKey: 'focus', score: 5 },
  { domainKey: 'confidence', score: 7 },
  { domainKey: 'motivation', score: 9 },
  { domainKey: 'stress', score: 3 },
  { domainKey: 'nutrition', score: 6 },
  { domainKey: 'connection', score: 8 }
];

const summary = buildSummary(template, responses, 'daily');
assert(summary.readinessScore != null, 'summary has score');
assert(summary.layerScores.recovery != null, 'recovery layer');
assert(summary.indicators.some((i) => i.key === 'recovery_concern'), 'recovery indicator');
assert(summary.indicators.some((i) => i.key === 'physical_comfort'), 'comfort indicator');
assert(summary.indicators.some((i) => i.key === 'stress_focus'), 'stress/focus indicator');
assert(summary.indicators.some((i) => i.key === 'motivation_recovery'), 'motivation/recovery indicator');

const competitionOnly = buildSummary(
  template,
  [...responses, { domainKey: 'competition', score: 3 }, { domainKey: 'confidence', score: 3 }],
  'competition'
);
assert(
  competitionOnly.indicators.some((i) => i.key === 'low_confidence_competition'),
  'competition confidence indicator'
);

console.log('athleteReadiness scoring tests passed');
console.log('sample readinessScore:', summary.readinessScore, summary.readinessStatus);
