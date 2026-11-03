import { describe, expect, it } from 'vitest';
import { nextRetainedOfficeStepIndex } from '../officeIntakeNavigation.js';

const steps = ids => ids.map(id => ({ id }));

describe('shorter office enrollment navigation', () => {
  it('lands on safety when earlier optional pages and the current page disappear', () => {
    const previous = steps(['identity', 'goals', 'symptoms', 'history', 'safety', 'communications', 'consent']);
    const retained = steps(['identity', 'safety', 'communications', 'consent']);
    expect(nextRetainedOfficeStepIndex(previous, 'history', retained)).toBe(1);
  });

  it('moves past an already validated current page that remains in the shorter flow', () => {
    const previous = steps(['identity', 'goals', 'safety', 'questionnaires', 'communications', 'consent']);
    const retained = steps(['identity', 'safety', 'communications', 'consent']);
    expect(nextRetainedOfficeStepIndex(previous, 'safety', retained)).toBe(2);
  });

  it('preserves the expanded participant identity when skipping repeated pages', () => {
    const previous = steps(['about__c0', 'history__c0', 'safety__c0', 'about__c1', 'history__c1', 'safety__c1', 'consent']);
    const retained = steps(['about__c0', 'safety__c0', 'about__c1', 'safety__c1', 'consent']);
    expect(nextRetainedOfficeStepIndex(previous, 'history__c1', retained)).toBe(3);
    expect(nextRetainedOfficeStepIndex(previous, 'history__c0', retained)).toBe(1);
  });

  it('does not invent a numeric destination when the old page is unknown', () => {
    expect(nextRetainedOfficeStepIndex(steps(['identity', 'consent']), 'missing', steps(['consent']))).toBe(-1);
  });

  it('signals the end only when no later page remains', () => {
    expect(nextRetainedOfficeStepIndex(steps(['identity', 'questions']), 'questions', steps(['identity']))).toBe(-1);
  });
});
