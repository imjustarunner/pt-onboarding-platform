import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn().mockResolvedValue([{ insertId: 1 }]) } }));
vi.mock('../contactReminderToken.service.js', () => ({ publicAppBaseUrl: () => 'https://plottwisthq.com' }));
vi.mock('../schoolCareBridgeRouting.service.js', () => ({ routingDestination: () => null }));
import Agency from '../../models/Agency.model.js';
import { agencyEmailOrigin } from '../agencyEmailOrigin.service.js';
import { createEmailOptOutLink } from '../emailComplianceFooter.service.js';
import { createMisdirectedEmailReportLink } from '../misdirectedEmailReport.service.js';
const qa = { id: 450, slug: 'auricwell-qa-demo', feature_flags: { qaSandbox: { syntheticOnly: true } } };
beforeEach(() => { vi.clearAllMocks(); Agency.findById.mockResolvedValue(qa); });
it('keeps both QA footer links on the same dedicated host as recovery', async () => {
  const optOut = await createEmailOptOutLink({ email: 'qa.family@example.com', agencyId: 450, userId: 1440 });
  const report = await createMisdirectedEmailReportLink({ agencyId: 450, toEmail: 'qa.family@example.com' });
  expect(optOut).toMatch(/^https:\/\/app\.itsco\.health\/email-opt-out\/[a-f0-9]+$/);
  expect(report).toMatch(/^https:\/\/app\.itsco\.health\/report-misdirected-email\/[a-f0-9]+$/);
});
it('uses the stored agency host for real tenants', async () => {
  Agency.findById.mockResolvedValue({ id: 2, slug: 'itsco' });
  expect(await agencyEmailOrigin(2)).toBe('https://app.itsco.health');
  Agency.findById.mockResolvedValue({ id: 3, slug: 'nextlevelup' });
  expect(await agencyEmailOrigin(3)).toBe('https://app.nextleveluplcc.com');
});
it('requires the full QA identity and leaves platform emails on the platform', async () => {
  Agency.findById.mockResolvedValue({ id: 450, slug: 'auricwell-qa-demo', feature_flags: {} });
  expect(await agencyEmailOrigin(450)).toBe('https://plottwisthq.com');
  Agency.findById.mockClear();
  expect(await agencyEmailOrigin(null)).toBe('https://plottwisthq.com');
  expect(Agency.findById).not.toHaveBeenCalled();
});
