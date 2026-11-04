import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';

const m = vi.hoisted(() => ({ db: null, send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {
  execute: (...args) => m.db.execute(...args),
  getConnection: () => m.db.getConnection()
} }));
vi.mock('../../models/Client.model.js', () => ({ default: {
  findById: async id => (await m.db.execute('SELECT * FROM fixture_clients WHERE id=?', [id]))[0][0]
} }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {
  listForClient: async id => (await m.db.execute('SELECT * FROM fixture_guardians WHERE client_id=?', [id]))[0],
  isNoView: permissions => !!permissions?.noView
} }));
vi.mock('../assessmentDeliverable.service.js', () => ({ assertClientCanViewOwnShared: async ({ user, clientId }) => {
  const [[grant]] = await m.db.execute('SELECT client_id,agency_id FROM fixture_guardians WHERE client_id=? AND guardian_user_id=? AND clinical_grant=1', [clientId, user.id]);
  if (!grant) throw Object.assign(new Error('Clinical access withdrawn'), { status: 403 });
  return grant;
} }));
vi.mock('../familyNotificationChoices.service.js', () => ({ familyNotificationDeliveryGate: async () => ({ allowed: true }) }));
vi.mock('../clientPortalEmail.service.js', () => ({
  clientEmailContext: async () => ({ portal: { slug: 'fixture' }, url: path => `https://example.invalid/fixture/${path}` }),
  sendClientPortalEmail: m.send
}));
vi.mock('../clientPortalContext.service.js', () => ({ clientPortalInviteUrl: () => 'https://example.invalid/fixture/login?redirect=%2Ffixture%2Fguardian' }));
import { createClientUpdate, sendClientUpdate, resolveClientUpdatePacketBinding } from '../clientUpdate.service.js';

describe.skipIf(!recoveryMysqlEnabled)('saved client updates on isolated MySQL', () => {
  let fixture, migration;
  const install = async () => {
    for (const statement of migration.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await m.db.query(statement);
  };
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('client_updates_test'); m.db = fixture.db;
    migration = await fs.readFile(new URL('../../../../database/migrations/1752_client_update_workflows.sql', import.meta.url), 'utf8');
    await install(); await install();
    await m.db.query('CREATE TABLE fixture_clients(id INT PRIMARY KEY,agency_id INT,organization_id INT,client_type VARCHAR(30),status VARCHAR(30),initials VARCHAR(12))');
    await m.db.query('CREATE TABLE fixture_guardians(client_id INT,agency_id INT,guardian_user_id INT,email VARCHAR(100),role VARCHAR(30),status VARCHAR(30),access_enabled BOOLEAN,is_active BOOLEAN,clinical_grant BOOLEAN,permissions_json JSON)');
  });
  afterAll(async () => { vi.unstubAllEnvs(); if (fixture) await fixture.close(); });
  beforeEach(async () => {
    vi.stubEnv('CLIENT_UPDATE_WORKFLOWS_ENABLED', 'true');
    for (const table of ['client_update_items', 'client_update_requests', 'client_portal_share_events', 'fixture_clients', 'fixture_guardians']) await m.db.query(`DELETE FROM ${table}`);
    await m.db.query("INSERT INTO fixture_clients VALUES(5,2,20,'clinical','CURRENT','TEST')");
    await m.db.query("INSERT INTO fixture_guardians VALUES(5,2,8,'caregiver@example.invalid','client_guardian','ACTIVE',1,1,1,JSON_OBJECT())");
    m.send.mockReset().mockResolvedValue({ id: 'synthetic-accepted' });
  });
  const create = () => createClientUpdate({ agencyId: 2, clientId: 5, body: { portalSteps: ['information'] }, actorUserId: 1 });
  const deliver = id => sendClientUpdate(id, { actorUserId: 1, guardianEmail: 'caregiver@example.invalid' });

  it('reapplies migration1752 without changing saved requests, items or share history', async () => {
    const request = await create();
    await m.db.execute("INSERT INTO client_portal_share_events(agency_id,client_id,recipient_user_id,kind,reference_id) VALUES(2,5,8,'deliverable','synthetic')");
    const tables = ['client_update_requests', 'client_update_items', 'client_portal_share_events'];
    const before = await Promise.all(tables.map(async table => (await m.db.query(`SELECT * FROM ${table}`))[0]));
    expect(before.every(rows => rows.length > 0)).toBe(true);
    await install(); await install();
    const after = await Promise.all(tables.map(async table => (await m.db.query(`SELECT * FROM ${table}`))[0]));
    expect(after).toEqual(before);
    expect(after[0][0].id).toBe(request.id);
  });

  it('saves the selected steps and admits only one concurrent transport attempt', async () => {
    const request = await create();
    expect((await m.db.execute('SELECT item_type,status FROM client_update_items WHERE request_id=?', [request.id]))[0]).toEqual([{ item_type: 'information', status: 'pending' }]);
    const attempts = await Promise.allSettled([deliver(request.id), deliver(request.id)]);
    expect(attempts.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(m.send).toHaveBeenCalledOnce();
    const [[saved]] = await m.db.execute('SELECT status,guardian_user_id FROM client_update_requests WHERE id=?', [request.id]);
    expect(saved).toMatchObject({ status: 'sent', guardian_user_id: 8 });
  });
  it('rolls a failed item insert back without leaving a partial saved request', async () => {
    await m.db.query("CREATE TRIGGER fixture_reject_item BEFORE INSERT ON client_update_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic failed item'");
    try {
      await expect(create()).rejects.toThrow('Synthetic failed item');
      expect((await m.db.query('SELECT COUNT(*) n FROM client_update_requests'))[0][0].n).toBe(0);
      expect((await m.db.query('SELECT COUNT(*) n FROM client_update_items'))[0][0].n).toBe(0);
    } finally { await m.db.query('DROP TRIGGER fixture_reject_item'); }
  });
  it('keeps an uncertain transport claimed and never automatically replays it', async () => {
    const request = await create(); m.send.mockRejectedValue(new Error('Synthetic uncertain transport'));
    await expect(deliver(request.id)).rejects.toThrow('uncertain transport');
    await expect(deliver(request.id)).rejects.toMatchObject({ status: 409 });
    expect(m.send).toHaveBeenCalledOnce();
    expect((await m.db.execute('SELECT status FROM client_update_requests WHERE id=?', [request.id]))[0][0].status).toBe('in_progress');
  });
  it('rechecks saved contact authority and exact packet/client scope without account writes', async () => {
    const request = await create(); await deliver(request.id);
    await m.db.execute("UPDATE client_update_requests SET packet_public_key='fixture-packet' WHERE id=?", [request.id]);
    const link = { public_key: 'fixture-packet', scope_type: 'agency', organization_id: 2, custom_messages: { clientUpdateRequestId: request.id } };
    expect(await resolveClientUpdatePacketBinding(link)).toMatchObject({ attachClientId: 5, guardianUserId: 8, attachSource: 'client_update' });
    await expect(resolveClientUpdatePacketBinding({...link,custom_messages:{}})).rejects.toMatchObject({status:409});
    await expect(resolveClientUpdatePacketBinding({...link,custom_messages:'{broken'})).rejects.toMatchObject({status:409});
    await expect(resolveClientUpdatePacketBinding({ ...link, organization_id: 4 })).rejects.toMatchObject({ status: 403 });
    await m.db.query('UPDATE fixture_guardians SET access_enabled=0');
    await expect(resolveClientUpdatePacketBinding(link)).rejects.toMatchObject({ status: 409 });
    await m.db.query('UPDATE fixture_guardians SET access_enabled=1,clinical_grant=0');
    await expect(resolveClientUpdatePacketBinding(link)).rejects.toMatchObject({ status: 403 });
    expect((await m.db.query('SELECT access_enabled,clinical_grant FROM fixture_guardians'))[0][0]).toEqual({ access_enabled: 1, clinical_grant: 0 });
    await m.db.execute("UPDATE client_update_requests SET status='cancelled' WHERE id=?",[request.id]);
    await expect(resolveClientUpdatePacketBinding({...link,custom_messages:{}})).rejects.toMatchObject({status:409});
  });
});
