/**
 * Run: node backend/src/services/collegeReadiness.scoring.test.js
 */
import {
  calculateCollegeReadinessScore,
  calculateWeightedCollegeReadinessScore,
  calculateCollegeConfidenceGap,
  calculateCollegeSupportGap,
  collegeReadinessStatusLabel,
  buildSummary
} from './collegeReadiness.scoring.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateCollegeReadinessScore([10, 10]) === 100, 'avg 10s');
assert(calculateCollegeReadinessScore([null, 5]) === 50, 'nulls excluded');
assert(
  calculateWeightedCollegeReadinessScore([
    { score: 5, weight: 50 },
    { score: 10, weight: 50 }
  ]) === 75,
  'weighted'
);
assert(calculateCollegeConfidenceGap(8, 5) === 3, 'confidence gap');
assert(calculateCollegeSupportGap(7, 4) === 3, 'support gap');
assert(collegeReadinessStatusLabel(73) === 'Building Strong Readiness', 'status');

const allVersions = [
  'junior',
  'senior',
  'first-generation',
  'community-college',
  'residential-four-year',
  'transfer',
  'returning-adult'
];

const template = {
  domains: [
    { key: 'academic_foundations', label: 'Academic', shortLabel: 'Academic', weight: 12, launchSystem: 'academic', launchStage: 'prepare', color: '#0EA5E9', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'study_strategies', label: 'Study', shortLabel: 'Study', weight: 10, launchSystem: 'academic', launchStage: 'prepare', color: '#0284C7', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'time_management', label: 'Time', shortLabel: 'Time', weight: 10, launchSystem: 'academic', launchStage: 'prepare', color: '#22C55E', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'self_advocacy', label: 'Advocacy', shortLabel: 'Advocacy', weight: 10, launchSystem: 'independence', launchStage: 'transition', color: '#8B5CF6', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'independent_living', label: 'Living', shortLabel: 'Living', weight: 8, launchSystem: 'independence', launchStage: 'transition', color: '#A855F7', studentVersions: ['senior', ...allVersions.slice(2)], availableModes: ['full'] },
    { key: 'financial_readiness', label: 'Financial', shortLabel: 'Financial', weight: 12, launchSystem: 'financial', launchStage: 'apply', color: '#F59E0B', studentVersions: allVersions, availableModes: ['full'], checklistSuggestions: ['Complete FAFSA'] },
    { key: 'application_enrollment', label: 'Applications', shortLabel: 'Apps', weight: 10, launchSystem: 'planning', launchStage: 'apply', color: '#EF4444', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'career_direction', label: 'Direction', shortLabel: 'Direction', weight: 8, launchSystem: 'planning', launchStage: 'explore', color: '#14B8A6', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'systems_navigation', label: 'Systems', shortLabel: 'Systems', weight: 6, launchSystem: 'independence', launchStage: 'enroll', color: '#6366F1', studentVersions: allVersions.slice(1), availableModes: ['full'] },
    { key: 'social_emotional', label: 'Social', shortLabel: 'Social', weight: 6, launchSystem: 'transition', launchStage: 'transition', color: '#EC4899', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'support_network', label: 'Support', shortLabel: 'Support', weight: 4, launchSystem: 'transition', launchStage: 'launch', color: '#64748B', studentVersions: allVersions, availableModes: ['full'] },
    { key: 'motivation_confidence', label: 'Motivation', shortLabel: 'Motivation', weight: 4, launchSystem: 'transition', launchStage: 'launch', color: '#0F766E', studentVersions: allVersions, availableModes: ['full'] }
  ]
};

const responses = [
  { domainKey: 'academic_foundations', readinessScore: 8 },
  { domainKey: 'study_strategies', readinessScore: 7 },
  { domainKey: 'time_management', readinessScore: 4 },
  { domainKey: 'self_advocacy', readinessScore: 4, supportAvailabilityScore: 8 },
  { domainKey: 'independent_living', readinessScore: 8 },
  { domainKey: 'financial_readiness', readinessScore: 4, reflectionChips: ['Financial aid'] },
  { domainKey: 'application_enrollment', readinessScore: 4 },
  { domainKey: 'career_direction', readinessScore: 9 },
  { domainKey: 'systems_navigation', readinessScore: 4 },
  { domainKey: 'social_emotional', readinessScore: 4 },
  { domainKey: 'support_network', readinessScore: 8 },
  { domainKey: 'motivation_confidence', readinessScore: 9, confidenceScore: 4 }
];

const summary = buildSummary(template, responses, { mode: 'full', studentVersion: 'senior' });
assert(summary.collegeReadinessScore != null, 'has score');
assert(summary.systemScores.academic != null, 'academic system');
assert(summary.indicators.some((i) => i.key === 'academic_time'), 'academic/time');
assert(summary.indicators.some((i) => i.key === 'motivation_application'), 'motivation/app');
assert(summary.indicators.some((i) => i.key === 'financial_concern'), 'financial');
assert(summary.indicators.some((i) => i.key === 'advocacy_gap'), 'advocacy');

console.log('collegeReadiness scoring tests passed');
console.log('sample score:', summary.collegeReadinessScore, summary.collegeReadinessStatus);
