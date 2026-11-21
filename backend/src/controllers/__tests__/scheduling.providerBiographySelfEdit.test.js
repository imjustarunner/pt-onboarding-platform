import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), agencies: vi.fn(), update: vi.fn(), profile: vi.fn(), saveProfile: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: m.getConnection }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies, update: m.update } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: m.profile, upsertForProvider: m.saveProfile } }));
import { upsertUserProviderPublicProfile, upsertUserProviderSchoolBiography } from '../providerPublicProfile.controller.js';

let database, connection;
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (role = 'provider', body = { schoolId: 30, schoolBlurb: 'School introduction' }) => ({ params: { id: '7' }, user: { id: 7, role }, body });
beforeEach(() => {
  vi.clearAllMocks();
  database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE agencies(id INTEGER PRIMARY KEY,organization_type TEXT,is_archived INTEGER DEFAULT 0);
    CREATE TABLE organization_affiliations(organization_id INTEGER,is_active INTEGER);
    CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER);
    CREATE TABLE provider_school_assignments(provider_user_id INTEGER,school_organization_id INTEGER,is_active INTEGER);
    INSERT INTO agencies(id,organization_type) VALUES(2,'agency'),(30,'school'),(40,'program'),(50,NULL);
    INSERT INTO organization_affiliations VALUES(30,1),(50,1);
    INSERT INTO user_agencies VALUES(7,2,1),(7,30,1),(7,40,1);`);
  m.execute.mockImplementation(async (sql, values) => [database.prepare(sql).all(...values)]);
  m.agencies.mockResolvedValue([{ id: 2 }, { id: 30 }]);
  m.update.mockResolvedValue({ id: 7 });
  m.profile.mockResolvedValue({ publicBlurb: 'Original website introduction', details: {}, insurances: [] });
  m.saveProfile.mockResolvedValue({ publicBlurb: 'New website introduction' });
  connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async () => [[]]) };
  m.getConnection.mockResolvedValue(connection);
});
afterEach(() => database.close());

it.each(['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant', 'admin', 'super_admin'])('lets a %s edit only their own biography fields', async role => {
  const school = response(), next = vi.fn();
  await upsertUserProviderSchoolBiography(request(role), school, next);
  expect(next).not.toHaveBeenCalled(); expect(school.json).toHaveBeenCalledWith({ ok: true, userId: 7, schoolId: 30, schoolBlurb: 'School introduction' });
  expect(m.update).toHaveBeenCalledExactlyOnceWith(7, { providerSchoolInfoBlurb: 'School introduction' });
  expect(m.saveProfile).not.toHaveBeenCalled();
  await upsertUserProviderPublicProfile(request(role, { agencyId: 2, publicBlurb: 'New website introduction' }), response(), next);
  expect(next).not.toHaveBeenCalled();
  expect(m.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ providerUserId: 7, publicBlurb: 'New website introduction' }));
  expect(m.update).toHaveBeenCalledTimes(1);
});

it.each(['provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant'])('rejects a %s changing another provider’s biography', async role => {
  const req = request(role); req.params.id = '9';
  const school = response(); await upsertUserProviderSchoolBiography(req, school, vi.fn());
  expect(school.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
  const website = response(); await upsertUserProviderPublicProfile({ ...req, body: { agencyId: 2, publicBlurb: 'Other biography' } }, website, vi.fn());
  expect(website.status).toHaveBeenCalledWith(403); expect(m.saveProfile).not.toHaveBeenCalled();
});

it.each(['provider', 'super_admin'])('requires an actual school affiliation even for %s accounts with agency-wide access', async role => {
  database.exec('DELETE FROM user_agencies WHERE agency_id=30');
  const res = response(); await upsertUserProviderSchoolBiography(request(role), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
});

it('accepts an active school provider assignment without a legacy membership, and rejects it once removed', async () => {
  database.exec('DELETE FROM user_agencies WHERE agency_id=30; INSERT INTO provider_school_assignments VALUES(7,30,1)');
  const allowed = response(); await upsertUserProviderSchoolBiography(request(), allowed, vi.fn());
  expect(allowed.json).toHaveBeenCalled(); m.update.mockClear();
  database.exec('UPDATE provider_school_assignments SET is_active=0');
  const denied = response(); await upsertUserProviderSchoolBiography(request(), denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
});

it.each(['UPDATE user_agencies SET is_active=0 WHERE agency_id=30', 'UPDATE agencies SET is_archived=1 WHERE id=30'])('rejects retired school affiliations: %s', async change => {
  database.exec(change);
  const res = response(); await upsertUserProviderSchoolBiography(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
});

it('requires a school rather than a program or parent agency, including legacy school types', async () => {
  for (const schoolId of [2, 40]) {
    const res = response(); await upsertUserProviderSchoolBiography(request('provider', { schoolId, schoolBlurb: 'Introduction' }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  }
  database.exec('INSERT INTO user_agencies VALUES(7,50,1)');
  const legacy = response(); await upsertUserProviderSchoolBiography(request('provider', { schoolId: 50, schoolBlurb: 'Legacy school introduction' }), legacy, vi.fn());
  expect(legacy.json).toHaveBeenCalled();
});

it.each([{ role: 'super_admin' }, { hasProviderAccess: true }, { publicBlurb: 'Website overwrite' }, { schoolBlurb: 'x'.repeat(4001) }, { schoolBlurb: {} }])('rejects unrelated fields and invalid text: %j', change => {
  const res = response();
  return upsertUserProviderSchoolBiography(request('provider', { schoolId: 30, schoolBlurb: 'Introduction', ...change }), res, vi.fn()).then(() => {
    expect(res.status).toHaveBeenCalledWith(400); expect(m.update).not.toHaveBeenCalled();
  });
});

it('allows clearing the school biography without changing the website biography', async () => {
  const res = response(); await upsertUserProviderSchoolBiography(request('provider', { schoolId: 30, schoolBlurb: '  ' }), res, vi.fn());
  expect(m.update).toHaveBeenCalledExactlyOnceWith(7, { providerSchoolInfoBlurb: null });
  expect(m.saveProfile).not.toHaveBeenCalled();
});

it('retains authorized manager edits while rejecting an unrelated school manager', async () => {
  const req = request('admin'); req.user.id = 8;
  const allowed = response(); await upsertUserProviderSchoolBiography(req, allowed, vi.fn());
  expect(allowed.json).toHaveBeenCalled(); m.update.mockClear(); m.agencies.mockResolvedValue([{ id: 99 }]);
  const denied = response(); await upsertUserProviderSchoolBiography(req, denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
});
