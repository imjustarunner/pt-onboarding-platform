import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.db.execute(...args), getConnection: (...args) => state.db.getConnection(...args) }, onTableWrite: vi.fn() }));
import { createAuricwellAgendaImporter } from '../auricwellAgendaImport.service.js';

const suite = process.env.AURICWELL_AGENDA_MYSQL_TEST === '1' ? describe : describe.skip;
suite('agenda fingerprints and import locks against disposable MySQL', () => {
  const schema = `auricwell_agenda_qa_${process.pid}`, actor = { id: 7, role: 'admin' };
  let admin, service, book;
  const input = { agencyId: 2, providerId: 19, weekStart: '2026-11-16', timeZone: 'America/Denver', text: 'Monday | 09:00 | 09:50 | DEMO QA Avery', defaults: { tenantServiceId: 3, serviceLocationId: 5, modality: 'IN_PERSON', recurrence: 'ONCE' } };
  beforeAll(async () => {
    // This opt-in fixture can only address the task-owned local MySQL instance.
    const connection = { host: '127.0.0.1', port: 13386, user: 'root', password: '', timezone: '+00:00' };
    admin = await mysql.createConnection(connection);
    await admin.query(`CREATE DATABASE \`${schema}\``);
    state.db = mysql.createPool({ ...connection, database: schema, connectionLimit: 6 });
    for (const sql of [
      'CREATE TABLE clients (id INT PRIMARY KEY,full_name VARCHAR(100)) ENGINE=InnoDB',
      `CREATE TABLE appointments (id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,provider_user_id INT,start_at DATETIME,end_at DATETIME,
        status VARCHAR(32) DEFAULT 'scheduled',tenant_service_id INT,service_location_id INT,modality VARCHAR(32),source VARCHAR(64),provider_schedule_event_id INT NULL,office_event_id INT NULL,
        KEY provider_window(provider_user_id,start_at),KEY agency_source(agency_id,source)) ENGINE=InnoDB`,
      `CREATE TABLE appointment_participants (id INT AUTO_INCREMENT PRIMARY KEY,appointment_id INT,client_id INT,role VARCHAR(32),sort_order INT DEFAULT 0,
        FOREIGN KEY(appointment_id) REFERENCES appointments(id),FOREIGN KEY(client_id) REFERENCES clients(id)) ENGINE=InnoDB`,
      `CREATE TABLE provider_schedule_events (id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,provider_id INT,client_id INT,start_at DATETIME,end_at DATETIME,
        status VARCHAR(32),kind VARCHAR(32),reason_code VARCHAR(64)) ENGINE=InnoDB`,
      "INSERT INTO clients VALUES (41,'DEMO QA Avery')"
    ]) await state.db.query(sql);
  }, 20000);
  beforeEach(async () => {
    await state.db.execute('DELETE FROM appointment_participants');
    await state.db.execute('DELETE FROM appointments');
    book = vi.fn(async ({ row }) => {
      const connection = await state.db.getConnection();
      try {
        await connection.beginTransaction();
        const [saved] = await connection.execute(`INSERT INTO appointments(agency_id,provider_user_id,start_at,end_at,tenant_service_id,service_location_id,modality,source)
          VALUES (?,?,?,?,?,?,?,?)`, [row.agencyId, row.providerId, row.startAt, row.endAt, row.tenantServiceId, row.serviceLocationId, row.modality, row.source]);
        await connection.execute("INSERT INTO appointment_participants(appointment_id,client_id,role) VALUES (?,?,'client')", [saved.insertId, row.clientId]);
        await new Promise(resolve => setTimeout(resolve, 20));
        await connection.commit();
        return { id: Number(saved.insertId), source: row.source };
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    });
    service = createAuricwellAgendaImporter({
      loadContext: async () => ({ agencyId: 2, providerId: 19, timeZone: 'America/Denver', provider: { id: 19, status: 'active' }, clients: [{ id: 41, full_name: 'DEMO QA Avery', status: 'active' }], services: [{ id: 3, name: 'Therapy', serviceCode: '90834', modality: 'EITHER' }], locations: [{ id: 5, name: 'DEMO office', place_of_service: '11' }] }),
      checkConflict: async () => {}, sameDay: async () => [], clientLock: async (_, work) => work(), book,
      completeFacets: async ({ appointment }) => appointment, now: () => Date.parse('2026-11-10T12:00:00Z')
    });
  });
  afterAll(async () => {
    if (state.db) { await state.db.end(); state.db = null; }
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``); await admin.end(); }
  });

  it('serializes concurrent retries and reuses the persisted appointment and participants', async () => {
    const preview = await service.preview({ actor, input });
    const commit = { ...input, rows: preview.rows, confirm: true, previewToken: preview.previewToken };
    const results = await Promise.all([service.commit({ actor, input: commit }), service.commit({ actor, input: commit })]);
    expect(results.every(result => result.complete)).toBe(true);
    expect(results.reduce((sum, result) => sum + result.createdCount, 0)).toBe(1);
    expect(book).toHaveBeenCalledTimes(1);
    const [[counts]] = await state.db.execute('SELECT COUNT(*) appointments,(SELECT COUNT(*) FROM appointment_participants) participants FROM appointments');
    expect(Number(counts.appointments)).toBe(1); expect(Number(counts.participants)).toBe(1);
    const again = await service.preview({ actor, input });
    expect(again.summary).toMatchObject({ existingAppointments: 1, newAppointments: 0 });
  });

  it('recognizes an existing canonical appointment and refuses a canceled or edited imported record', async () => {
    let preview = await service.preview({ actor, input });
    const commit = { ...input, rows: preview.rows, confirm: true, previewToken: preview.previewToken };
    const created = await service.commit({ actor, input: commit });
    await state.db.execute("UPDATE appointments SET source='staff_grid' WHERE id=?", [created.appointments[0].id]);
    preview = await service.preview({ actor, input });
    expect(preview.summary.existingAppointments).toBe(1);
    expect((await service.commit({ actor, input: { ...input, rows: preview.rows, confirm: true, previewToken: preview.previewToken } })).existingCount).toBe(1);
    expect(book).toHaveBeenCalledTimes(1);
    const source = book.mock.calls[0][0].row.source;
    await state.db.execute("UPDATE appointments SET source=?,status='canceled_by_provider'", [source]);
    preview = await service.preview({ actor, input });
    expect(preview.summary.blockedRows).toBe(1); expect(preview.previewToken).toBeNull();
    const [[counts]] = await state.db.execute('SELECT COUNT(*) count FROM appointments');
    expect(Number(counts.count)).toBe(1);
  });
});
