import { describe, it, expect } from 'vitest';
import { NARRIVA_AUDIT_STANDARD, NARRIVA_AUDIT_CHECKS, summarizeNarrivaAuditEvidence } from '../../content/narrivaAuditStandards.js';

describe('supplied CCHA audit standard', () => {
  it('keeps missing audit evidence incomplete without inventing a payer pass score', () => {
    const result = summarizeNarrivaAuditEvidence();
    expect(result.status).toBe('incomplete');
    expect(result.counts.not_assessed).toBe(NARRIVA_AUDIT_CHECKS.length);
    expect(result.completenessPercent).toBe(0);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('passed');
    expect(NARRIVA_AUDIT_STANDARD.sourceSha256).toHaveLength(64);
  });
  it('does not accept unsubstantiated passes or skipping mandatory elements', () => {
    const result = summarizeNarrivaAuditEvidence({ 'general.identity_match': { status: 'not_applicable', evidence: 'No claim provided' }, 'general.signature': { status: 'passed' } });
    expect(result.checks.find(c=>c.id==='general.identity_match').status).toBe('not_assessed');
    expect(result.checks.find(c=>c.id==='general.signature').status).toBe('not_assessed');
  });
  it('respects documented conditional exclusions without granting points', () => {
    const result=summarizeNarrivaAuditEvidence({'procedure.prtf':{status:'not_applicable',evidence:'This is an outpatient encounter.'}});
    expect(result.counts.not_applicable).toBe(1);
    expect(result.counts.passed).toBe(0);
    expect(result.status).toBe('incomplete');
  });
  it('fails the dependent category when procedure documentation fails', () => {
    const evidence=Object.fromEntries(NARRIVA_AUDIT_CHECKS.map(c=>[c.id,{status:'passed',evidence:'Synthetic validated evidence'}]));
    evidence['procedure.service_content']={status:'failed',evidence:'No intervention evidence supports this service.'};
    const result=summarizeNarrivaAuditEvidence(evidence);
    expect(result.status).toBe('findings');
    expect(result.checks.find(c=>c.id==='category.procedure_dependency').status).toBe('failed');
    expect(result.completenessPercent).toBe(100);
  });
  it('requires every applicable element before internal readiness and keeps identifiers off the narrative checklist', () => {
    const evidence=Object.fromEntries(NARRIVA_AUDIT_CHECKS.map(c=>[c.id,{status:'passed',evidence:'Synthetic validated evidence'}]));
    expect(summarizeNarrivaAuditEvidence(evidence).status).toBe('ready_for_review');
    const narrative=NARRIVA_AUDIT_CHECKS.filter(c=>c.evidence==='narrative').map(c=>c.id);
    expect(narrative).not.toContain('general.page_identifiers');
    expect(narrative).not.toContain('population.birth_date');
    expect(narrative).not.toContain('general.signature');
  });
});
