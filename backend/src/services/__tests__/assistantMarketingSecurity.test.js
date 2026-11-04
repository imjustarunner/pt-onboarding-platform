import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../familyBillingEncryption.service.js', () => ({
  encryptFamilyBilling: value => JSON.stringify(value), decryptFamilyBilling: value => JSON.parse(value)
}));
import { prepareAssistantMarketingPackets, previewAssistantMarketing, publishAssistantMarketing } from '../assistantMarketing.service.js';
import { assistantDigest, assistantStoredConfigurationHash } from '../assistantTeamPolicy.js';

function fixture() {
  const site = { pageId: 1, variants: [{ key: 'plain', label: 'General copy', fields: { heroTitle: 'Approved welcome' } }] };
  const a = { id: 4, agency_id: 450, subrole: 'marketing', status: 'active', group_status: 'ready', policy_revision: 1,
    capabilities_json: ['marketing.analytics', 'marketing.publish'], baa_status: 'pending',
    privacy_policy_json: { marketing: { approvedContentReviewed: true, sites: [site] } } };
  const page = { id: 1, hero_title: 'Welcome', hero_subtitle: 'General agency information', updated_at: '2026-11-02T00:00:00Z' };
  a.configuration_fingerprint = assistantStoredConfigurationHash(a);
  const hash = assistantDigest({ pageId: 1, title: page.hero_title, subtitle: page.hero_subtitle, updatedAt: page.updated_at, policy: site, policyRevision: 1 });
  const work = { id: 33, account_id: 4, agency_id: 450, source_id: 1, source_kind: 'marketing_page', source_hash: hash, state: 'leased' };
  const previewRef = JSON.stringify({ accountId: 4, workId: 33, pageId: 1, variantKey: 'plain', sourceRevision: hash, expires: Date.now() + 60000 });
  return { a, page, work, site, hash, previewRef, evidence: { desktopChecked: true, mobileChecked: true, linksPreserved: true } };
}

describe('assistant marketing mutation and privacy boundary', () => {
  it('cannot preview a task without a live unfinished run lease', async () => {
    const { a } = fixture();
    const execute = vi.fn(async () => [[]]);
    await expect(previewAssistantMarketing({ account: a, taskRef: 'expired', variantKey: 'plain' }, { db: { execute } })).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    expect(execute.mock.calls[0][0]).toContain('r.lease_expires_at>UTC_TIMESTAMP(3)');
    expect(execute.mock.calls[0][0]).toContain('r.completed_at IS NULL');
  });
  it('rejects edits changed concurrently before the page lock is acquired', async () => {
    const { a, page, work, hash, previewRef, evidence } = fixture();
    const c = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
      if (sql.includes('FROM assistant_accounts')) return [[a]];
      if (sql.includes('FROM assistant_work_items')) return [[work]];
      if (sql.includes('FROM public_marketing_pages')) return [[{ ...page, hero_title: 'New human edit' }]];
      if (sql.includes('FROM public_marketing_page_sources')) return [[{ source_type: 'agency', source_id: 450 }]];
      throw Error('Unexpected write');
    }) };
    const db = { execute: vi.fn(async () => [[]]), getConnection: async () => c };
    await expect(publishAssistantMarketing({ account: a, previewRef, sourceRevision: hash, evidence }, { db })).rejects.toMatchObject({ code: 'ASSISTANT_SOURCE_CHANGED' });
    expect(c.execute.mock.calls.find(([sql]) => sql.includes('FROM public_marketing_pages'))[0]).toContain('FOR UPDATE');
    expect(c.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE public_marketing_pages'))).toBe(false);
    expect(c.rollback).toHaveBeenCalledOnce();
  });
  it('cannot publish an old preview after its run lease expires', async () => {
    const { a, hash, previewRef, evidence } = fixture();
    const c = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => sql.includes('FROM assistant_accounts') ? [[a]] : [[]]) };
    const db = { execute: vi.fn(async () => [[]]), getConnection: async () => c };
    await expect(publishAssistantMarketing({ account: a, previewRef, sourceRevision: hash, evidence }, { db })).rejects.toMatchObject({ code: 'TASK_NOT_AVAILABLE' });
    expect(c.execute.mock.calls.find(([sql]) => sql.includes('FROM assistant_work_items'))[0]).toContain('r.lease_expires_at>UTC_TIMESTAMP(3)');
    expect(c.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE public_marketing_pages'))).toBe(false);
  });
  it('screens first names and variant labels before either reaches the browser', async () => {
    const { a, page, site } = fixture(); site.variants[0].label = 'Ask CANARY_FIRST';
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('FROM public_marketing_pages')) return [[page]];
      if (sql.includes('FROM public_marketing_page_sources')) return [[{ source_type: 'agency', source_id: 450 }]];
      if (sql.includes('FROM users u')) return [[{ first_name: 'CANARY_FIRST', last_name: 'CANARY_LAST' }]];
      return [[]];
    }) };
    await expect(prepareAssistantMarketingPackets(a, { db })).rejects.toMatchObject({ code: 'PERSON_CONTENT_NOT_ALLOWED' });
  });
  it.each(['margaret', 'general_margaret_copy', 'general-margaret-copy'])('screens person references in variant keys before packet release: %s', async key => {
    const { a, page, site } = fixture(); site.variants[0].key = key;
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('FROM public_marketing_pages')) return [[page]];
      if (sql.includes('FROM public_marketing_page_sources')) return [[{ source_type: 'agency', source_id: 450 }]];
      if (sql.includes('FROM users u')) return [[{ first_name: 'Margaret', last_name: 'Canarysurname' }]];
      return [[]];
    }) };
    await expect(prepareAssistantMarketingPackets(a, { db })).rejects.toMatchObject({ code: 'PERSON_CONTENT_NOT_ALLOWED' });
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('public_website_analytics_events'))).toBe(false);
  });
  it('does not export contact details already present in current public copy', async () => {
    const { a, page } = fixture(); page.hero_subtitle = 'Email private-person@example.invalid';
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('FROM public_marketing_pages')) return [[page]];
      if (sql.includes('FROM public_marketing_page_sources')) return [[{ source_type: 'agency', source_id: 450 }]];
      return [[]];
    }) };
    await expect(prepareAssistantMarketingPackets(a, { db })).rejects.toMatchObject({ code: 'UNSAFE_MARKETING_COPY' });
  });
});
