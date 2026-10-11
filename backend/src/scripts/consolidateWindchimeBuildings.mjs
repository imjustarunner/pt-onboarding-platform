// Audited repair: preserve agency-owned billing identities; share physical building 1.
// Dry-run by default. Run migration 1610 first, then use --apply to commit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';

const apply = process.argv.includes('--apply');
const db = await pool.getConnection();
const keptReferences = new Set(['agency_group_npis', 'agency_service_locations', 'clients', 'client_agency_assignments', 'office_location_agencies', 'office_locations']);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function preservedState() {
  const state = {};
  for (const [table, column] of [['agency_group_npis','office_location_id'], ['agency_service_locations','billing_office_location_id'], ['clients','default_office_location_id'], ['client_agency_assignments','default_office_location_id']]) {
    // Hash in memory; never print client rows or billing payloads.
    const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE \`${column}\` IN (1,5,6,8)`);
    state[table] = { count: rows.length, hash: fingerprint(rows.map(row=>JSON.stringify(row)).sort()) };
  }
  return state;
}
try {
  await db.beginTransaction();
  const [buildings] = await db.query('SELECT id,agency_id,name,street_address,city,is_active,physical_office_location_id,practice_name,practice_npi,taxonomy_code FROM office_locations WHERE id IN (1,5,8) ORDER BY id FOR UPDATE');
  assert.equal(buildings.length, 3, 'Expected the three audited records');
  for (const [index, agencyId] of [2,6,377].entries()) {
    const building = buildings[index];
    assert.equal(building.agency_id, agencyId);
    assert.equal(building.name.trim(), 'Windchime');
    assert.equal(building.street_address.trim().toLowerCase(), '437 windchime place');
    assert.equal(building.city.toLowerCase(), 'colorado springs');
    assert.equal(building.is_active, 1);
    assert([null, ...(index ? [1] : [])].includes(building.physical_office_location_id));
  }
  const [refs] = await db.query(`SELECT DISTINCT c.TABLE_NAME,c.COLUMN_NAME FROM information_schema.COLUMNS c
    LEFT JOIN information_schema.KEY_COLUMN_USAGE k ON k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME AND k.REFERENCED_TABLE_NAME='office_locations'
    WHERE c.TABLE_SCHEMA=DATABASE() AND (k.REFERENCED_TABLE_NAME IS NOT NULL OR c.COLUMN_NAME LIKE '%office%location%id%' OR c.COLUMN_NAME IN ('building_id','office_id'))`);
  for (const { TABLE_NAME: table, COLUMN_NAME: column } of refs) {
    if (keptReferences.has(table)) continue;
    assert(/^[a-zA-Z0-9_]+$/.test(table + column));
    const [[{ n }]] = await db.query(`SELECT COUNT(*) n FROM \`${table}\` WHERE \`${column}\` IN (5,8)`);
    assert.equal(Number(n), 0, `Manual reconciliation required: ${table}.${column} has operational references`);
  }
  const before = await preservedState();
  await db.execute('UPDATE office_locations SET physical_office_location_id=1 WHERE id IN (5,8) AND physical_office_location_id IS NULL');
  // All agencies already attached to a Windchime identity share the physical building.
  await db.execute(`INSERT IGNORE INTO office_location_agencies (office_location_id,agency_id)
    SELECT 1,agency_id FROM office_locations WHERE id IN (1,5,8)
    UNION SELECT 1,agency_id FROM office_location_agencies WHERE office_location_id IN (1,5,8)`);
  const after = await preservedState();
  assert.deepEqual(after, before, 'Billing/client references changed');
  const [physical] = await db.query('SELECT id,name FROM office_locations WHERE is_active=1 AND physical_office_location_id IS NULL ORDER BY id');
  assert.deepEqual(physical.map(row => row.id), [1,6], 'Unexpected active physical buildings; review before applying');
  const [agencies] = await db.query('SELECT agency_id FROM office_location_agencies WHERE office_location_id=1 ORDER BY agency_id');
  assert.deepEqual(agencies.map(row => row.agency_id), [1,2,6,377]);
  if (apply) await db.commit(); else await db.rollback();
  console.log(JSON.stringify({ applied: apply, physicalBuildings: physical, windchimeAgencyIds: agencies.map(row=>row.agency_id), preservedReferences: Object.fromEntries(Object.entries(before).map(([key,value])=>[key,value.count])), billingIdentitiesKept: [5,8] }, null, 2));
} catch (error) { await db.rollback(); throw error; }
finally { db.release(); await pool.end(); }
