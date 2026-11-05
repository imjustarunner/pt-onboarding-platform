// All people, organizations and payment records in this fixture are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MANAGEMENT_SERVICE_CATALOG as defaults, catalogServicePrice, validateManagementServiceCatalog, createManagementServiceCatalog, canManageServiceCatalog } from '../managementServiceCatalog.js';

test('starting prices apply the managed discount once and retain separate revenue/space terms', () => {
  const catalog = validateManagementServiceCatalog(defaults);
  const price = id => catalogServicePrice(catalog, catalog.services.find(s => s.id === id), true);
  assert.deepEqual(price('full-management'), { amountCents: 30000, rateBps: 0 });
  assert.deepEqual(price('incorporation'), { amountCents: 17940, rateBps: 0 });
  assert.deepEqual(price('organization-platform'), { amountCents: 7440, rateBps: 0 });
  assert.equal(price('medical-billing').rateBps, 420);
  assert.equal(price('management-revenue-share').rateBps, 1000);
  assert.equal(price('space-sublease').rateBps, 800);
  assert.equal(catalog.services.filter(s => s.includedInManagement).length, 5);
});
test('rejects ambiguous prices, duplicate identifiers and unknown categories', () => {
  for (const change of [c => c.managedDiscountBps = 10001, c => c.services[0].amountCents = -1, c => c.services[0].amountCents = 1.5, c => c.services[0].rateBps = 100, c => c.services[0].category = 'unknown', c => c.services.push(c.services[0]), c => c.services[0].businessTypes = ['clinical-everyone']]) {
    const catalog = structuredClone(defaults); change(catalog);
    assert.throws(() => validateManagementServiceCatalog(catalog), e => e.status === 400);
  }
});
test('only PlotTwistCo administrators can save; unrelated agency admin is insufficient', async () => {
  const calls = [];
  const db = { async execute(sql, args) { calls.push({ sql, args }); return [[]]; } };
  assert.equal(await canManageServiceCatalog(db, { id: 4002, role: 'admin' }), false);
  assert.match(calls[0].sql, /slug='plottwistco'/);
  assert.match(calls[0].sql, /ua\.is_active=1/);
  await assert.rejects(() => createManagementServiceCatalog(db).save({ catalog: defaults, revision: 0 }, { id: 1, role: 'admin' }), e => e.status === 403);
  db.execute = async () => [[{ user_id: 4002 }]];
  assert.equal(await canManageServiceCatalog(db, { id: 4002, role: 'admin' }), true);
});
test('catalog saves check revision and retain an audit snapshot in the same transaction', async () => {
  const writes = []; let revision = 2, rolledBack = false, committed = false;
  const connection = {
    async beginTransaction() {}, async commit() { committed = true; }, async rollback() { rolledBack = true; }, release() {},
    async execute(sql, args) { if (sql.startsWith('SELECT revision')) return [[{ revision }]]; writes.push({ sql, args }); return [{ affectedRows: 1 }]; }
  };
  const db = { async getConnection() { return connection; } };
  const service = createManagementServiceCatalog(db);
  await assert.rejects(() => service.save({ catalog: defaults, revision: 1 }, { id: 4003, role: 'super_admin' }), e => e.status === 409);
  assert.equal(rolledBack, true); assert.equal(writes.length, 0);
  const result = await service.save({ catalog: defaults, revision: 2 }, { id: 4003, role: 'super_admin' });
  assert.equal(result.revision, 3); assert.equal(committed, true);
  assert.equal(writes.length, 2); assert.match(writes[1].sql, /management_service_catalog_events/);
  assert.deepEqual(JSON.parse(writes[0].args[0]), result.catalog);
});
