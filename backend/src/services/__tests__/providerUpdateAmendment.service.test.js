import { describe, it, expect } from 'vitest';
import {
  isJobDescriptionAcknowledgmentPlan,
  DEFAULT_JD_ACK_CONFIG_SLUG
} from '../providerUpdateAmendment.service.js';

describe('isJobDescriptionAcknowledgmentPlan', () => {
  it('detects explicit jd acknowledgment mode', () => {
    expect(isJobDescriptionAcknowledgmentPlan({
      mode: 'job_description_acknowledgment',
      effectiveDate: '2026-08-01'
    })).toBe(true);
  });

  it('detects config slug without mode', () => {
    expect(isJobDescriptionAcknowledgmentPlan({
      contractConfigSlug: DEFAULT_JD_ACK_CONFIG_SLUG
    })).toBe(true);
  });

  it('rejects legacy document template only plans', () => {
    expect(isJobDescriptionAcknowledgmentPlan({
      mode: 'document_template',
      documentTemplateId: 42
    })).toBe(false);
    expect(isJobDescriptionAcknowledgmentPlan({
      documentTemplateId: 42
    })).toBe(false);
  });

  it('rejects empty plans', () => {
    expect(isJobDescriptionAcknowledgmentPlan(null)).toBe(false);
    expect(isJobDescriptionAcknowledgmentPlan({})).toBe(false);
  });
});
