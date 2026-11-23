import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  execute: vi.fn(), core: vi.fn(), encryption: vi.fn(), db: {
    execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn()
  }
}));
vi.mock('../../config/database.js', () => ({ default: { execute: mock.execute, getConnection: mock.core } }));
vi.mock('../documentEncryption.service.js', () => ({ default: { encryptBuffer: mock.encryption } }));
vi.mock('../faxExtraction.service.js', () => ({ readFax: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn() }));

import { classifyFaxReferral, faxReferralRoutes } from '../faxReferralPolicy.js';
import { enqueueFaxReferral, runFaxReferralInbox } from '../inboundFaxReferral.service.js';
import { resolveNotifyreWebhookOwner } from '../notifyreWebhookRouting.service.js';
import { PDFDocument } from 'pdf-lib';

const referral = 'Counseling referral form\nPatient name: Synthetic Person\nDate of birth: 01/01/2000';
const billing = 'Invoice number 814\nStatement of account\nPayment due';
const sampleRow = { id: 'sample', agency_id: 2, agency_slug: 'itsco', receiving_number: '+17194318895', carrier_receipt: 'receipt-id', attempts: 0 };
let lease;

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ['NOTIFYRE_API_TOKEN','NOTIFYRE_WEBHOOK_SECRET','NOTIFYRE_BAA_REFERENCE','REFERRAL_KMS_KEY']) vi.stubEnv(key,'fixture');
  mock.core.mockResolvedValue(mock.db);
  mock.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('JOIN agencies a')) return [[sampleRow]];
    if (sql.includes('SELECT id FROM agencies')) return [[{ id: 2 }]];
    if (sql.includes('SET lease_token = ?')) lease = args[0];
    return [{ affectedRows: 1 }];
  });
  mock.db.execute.mockImplementation(async sql => sql.includes('FOR UPDATE')
    ? [[{ state: 'pending', lease_token: lease }]] : [{ affectedRows: 1, insertId: 42 }]);
  mock.encryption.mockResolvedValue({ encryptedBuffer: Buffer.from('encrypted'), encryptionKeyId: 'kms-fixture' });
});
afterEach(() => vi.unstubAllEnvs());

describe('carrier routes and confidential fax intake', () => {
  it('requires the agreement, credentials and encryption and routes by receiving number alone', async () => {
    expect(faxReferralRoutes({}).size).toBe(0);
    expect(Object.fromEntries(faxReferralRoutes())).toEqual({
      '+17194318895': 'itsco', '+17197500350': 'nlu', '+17193022551': 'tisi'
    });
    const event = { Event: 'fax_received', Timestamp: 1700000000, Payload: { ID: 'receipt-id', To: '17194318895', Agency: 'nlu' } };
    const matched = await resolveNotifyreWebhookOwner(event, {});
    expect(matched).toMatchObject({ kind: 'fax_referral', agencySlug: 'itsco' });
    await enqueueFaxReferral(matched.event, matched.agencySlug);
    expect(mock.execute.mock.calls[1][1].slice(1)).toEqual([2, '+17194318895', 'receipt-id']);
    expect(mock.execute.mock.calls[1][0]).toContain('ON DUPLICATE KEY');
    await expect(resolveNotifyreWebhookOwner(event, { clientMessaging: { routes: [{ mainNumber: '+17194318895', practiceId: 'other' }] } })).rejects.toMatchObject({ status: 409 });
  });

  it('keeps possible referrals and conflicting fax content in private review', () => {
    expect(classifyFaxReferral([{ text: referral }])).toBe('referral');
    expect(classifyFaxReferral([{ text: billing }])).toBe('filtered');
    expect(classifyFaxReferral([{ text: 'Fax cover sheet\nFor your information' }])).toBe('review');
    expect(classifyFaxReferral([{ text: referral }, { text: billing }])).toBe('review');
  });

  it.each([[referral,'referral',true], [billing,'filtered',false]])('stores ciphertext and creates a ticket only for a clear referral %#', async (body,state,hasTicket) => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const transport = vi.fn(async () => ({ Base64Str: await pdf.saveAsBase64() }));
    await runFaxReferralInbox({ transport, ocr: async () => ({ pages: [{ text: body }] }) });
    expect(transport).toHaveBeenCalledWith('fixture', '/fax/received/receipt-id/download');
    const ticket = mock.db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO support_tickets'));
    expect(Boolean(ticket)).toBe(hasTicket);
    if (ticket) expect(ticket[0]).toContain("'fax_referral', 'fax'");
    expect(mock.db.execute.mock.calls.at(-1)[1].slice(0,4)).toEqual([state, null, hasTicket ? 42 : null, Buffer.from('encrypted')]);
    expect(JSON.stringify(mock.db.execute.mock.calls)).not.toContain('Synthetic Person');
    expect(mock.db.commit).toHaveBeenCalledTimes(1);
  });
});
