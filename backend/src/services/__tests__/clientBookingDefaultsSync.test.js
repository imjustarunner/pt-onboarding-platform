import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
import pool from '../../config/database.js';
import Client from '../../models/Client.model.js';

let db;
beforeEach(() => {
  vi.clearAllMocks();
  db = { execute: vi.fn(async sql => sql.startsWith('SELECT agency_id') ? [[{ agency_id: 6 }]] : [{ affectedRows: 1 }]),
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(db);
});

it('saves chart and agency office defaults together in one transaction', async () => {
  await Client.update(4, { default_office_location_id: 77, default_place_of_service: '11' }, 9, { hydrate: false });
  expect(db.beginTransaction).toHaveBeenCalledOnce();
  expect(db.commit).toHaveBeenCalledOnce();
  const calls = db.execute.mock.calls;
  expect(calls[0][0]).toContain('UPDATE clients SET default_office_location_id = ?, default_place_of_service = ?');
  const [sql, values] = calls.find(([sql]) => sql.includes('INSERT INTO client_agency_assignments'));
  expect(sql).toContain('default_office_location_id = VALUES(default_office_location_id)');
  expect(values).toEqual([4, 6, 77, '11']);
});

it('rolls back both chart and agency defaults on a real synchronization failure', async () => {
  const execute = db.execute.getMockImplementation();
  db.execute.mockImplementation(async sql => {
    if (sql.includes('INSERT INTO client_agency_assignments')) throw new Error('Storage unavailable');
    return execute(sql);
  });
  await expect(Client.update(4, { default_office_location_id: 77 }, 9, { hydrate: false })).rejects.toThrow('Storage unavailable');
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
