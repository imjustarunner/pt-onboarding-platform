import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), choices: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../hubPeopleAccess.service.js', () => ({ hubClientScope: userId => ({ sql: 'c.provider_id=?', params: [userId] }), canAccessHubClient: vi.fn() }));
vi.mock('../clientConversationRecord.service.js', () => ({ emailClientCandidates: vi.fn() }));
vi.mock('../intakeCommunicationChoices.service.js', () => ({ latestIntakeCommunicationChoices: m.choices }));
import { guardianContactContext, guardianVoicemailConversations } from '../guardianContactContext.service.js';
beforeEach(() => vi.resetAllMocks());
it('shows an authorized guardian account without client links', async () => {
  m.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ guardian_id: 20, first_name: 'Pat', last_name: 'Example', email: 'pat@example.test' }]]);
  expect(await guardianContactContext({ userId: 7, guardianId: 20 })).toEqual({ guardian: { id: 20, name: 'Pat Example', email: 'pat@example.test', phone: null }, clients: [] });
  const [sql, args] = m.execute.mock.calls[1];
  expect(args).toEqual([20, 7]);
  expect(sql).toContain("LOWER(viewer.role)='super_admin'");
  expect(sql).toContain("LOWER(viewer.role) IN ('admin','support')");
  expect(sql).toContain('guardian_agency.agency_id=viewer_agency.agency_id');
  expect(m.choices).not.toHaveBeenCalled();
});
it('does not expose an absent or unauthorized account', async () => {
  m.execute.mockResolvedValue([[]]);
  await expect(guardianContactContext({ userId: 7, guardianId: 20 })).rejects.toMatchObject({ status: 404 });
});
it('keeps existing linked-client context and preferences', async () => {
  m.execute.mockResolvedValueOnce([[{ id: 4, agency_id: 2, name: 'Example Client', agency_name: 'Example Agency', agency_slug: 'example', relationship_title: 'Parent', guardian_id: 20, first_name: 'Pat', email: 'pat@example.test' }]]);
  m.choices.mockResolvedValue({ noRoutineCalls: true });
  const context = await guardianContactContext({ userId: 7, guardianId: 20 });
  expect(context.clients).toEqual([expect.objectContaining({ id: 4, contactPreferences: expect.objectContaining({ noRoutineCalls: true }) })]);
  expect(m.execute).toHaveBeenCalledOnce();
  expect(m.execute.mock.calls[0][0]).toContain("'$.relationshipRevoked'");
});
it('returns no voicemail threads without querying an empty agency list', async () => {
  m.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ guardian_id: 20, first_name: 'Pat' }]]);
  expect(await guardianVoicemailConversations({ user: { id: 7 }, guardianId: 20 })).toEqual({ conversations: [] });
  expect(m.execute).toHaveBeenCalledTimes(2);
});
