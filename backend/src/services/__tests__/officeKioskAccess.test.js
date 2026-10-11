import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: db.execute, getConnection: async () => db } }));
import { codeLookup, hashCode, unlockOffice, rotateOfficeCode, consumeUnlockAttempt, readOfficeDevice, kioskCookieOptions, kioskCookieName } from '../officeKioskAccess.service.js';
import { requireOfficeDevice, kioskSameOrigin } from '../../middleware/officeKioskAccess.middleware.js';
let access, device, counts, now;
beforeEach(() => {
  vi.resetAllMocks(); process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
  access = null; device = null; counts = new Map(); now = 1800000000;
  db.execute.mockImplementation(async (sql, values = []) => {
    if (sql.includes('UNIX_TIMESTAMP() AS now')) return [[{ now }]];
    if (sql.includes('INSERT INTO office_kiosk_attempts')) { counts.set(values[0], (counts.get(values[0]) || 0) + 1); return [{}]; }
    if (sql.includes('SELECT attempts')) return [[{ attempts: counts.get(values[0]) }]];
    if (sql.includes('SELECT a.*')) return [[access].filter(Boolean)];
    if (sql.includes('SELECT d.id, d.office_location_id')) return [[device].filter(Boolean)];
    return [{ affectedRows: 1 }];
  });
});
const response = () => ({ set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn(), sendStatus: vi.fn() });
describe('office device credentials', () => {
  it('stores salted hashes and a secret-keyed lookup, never the six-digit code', async () => {
    const { code } = await rotateOfficeCode(6, 5);
    expect(code).toMatch(/^\d{6}$/);
    const write = db.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE office_kiosk_access'));
    expect(write[1]).not.toContain(code);
    expect(write[1][0]).toBe(codeLookup(code));
    expect(write[1][2]).toBe(await hashCode(code, write[1][1]));
    expect(write[1][5]).toBe(6);
  });
  it('uses a random opaque token and returns only its office identity', async () => {
    access = { office_location_id: 6, name: 'Denver', revision: 'revision', code_salt: 'salt', code_hash: await hashCode('004321', 'salt') };
    const result = await unlockOffice('004321', '192.0.2.1');
    expect(result.session).toEqual({ locationId: 6, locationName: 'Denver' });
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    const params = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO office_kiosk_devices'))[1];
    expect(params).not.toContain(result.token); expect(params).not.toContain('004321'); expect(params[2]).toBe('revision');
  });
  it('rejects unknown or malformed codes with the same error and does not create a device', async () => {
    await expect(unlockOffice('123456', 'ip')).rejects.toMatchObject({ status: 401 });
    await expect(unlockOffice('bad', 'ip')).rejects.toMatchObject({ status: 401 });
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO office_kiosk_devices'))).toBe(false);
  });
  it('rejects six guesses from one IP, retaining committed counts across retries', async () => {
    for (let i=0;i<5;i++) await consumeUnlockAttempt('same-ip');
    await expect(consumeUnlockAttempt('same-ip')).rejects.toMatchObject({ status: 429 });
    expect(db.commit).toHaveBeenCalledTimes(6);
  });
  it('bounds guessing across rotating IP addresses as well', async () => {
    for (let i=0;i<100;i++) await consumeUnlockAttempt(`ip-${i}`);
    await expect(consumeUnlockAttempt('another-ip')).rejects.toMatchObject({ status: 429 });
  });
  it('also bounds distributed guesses over an entire day', async () => {
    for(let hour=0;hour<5;hour++) { for(let attempt=0;attempt<100;attempt++) await consumeUnlockAttempt(`ip-${hour}-${attempt}`); now+=3600; }
    await expect(consumeUnlockAttempt('last-ip')).rejects.toMatchObject({status:429});
  });
  it('fails closed when the hashing secret or database is unavailable', async () => {
    const secret = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
    expect(() => codeLookup('123456')).toThrow('not configured'); process.env.JWT_SECRET = secret;
    db.execute.mockRejectedValue(new Error('database unavailable'));
    await expect(unlockOffice('123456','ip')).rejects.toThrow('database unavailable');
  });
  it('invalidates archived offices, revoked/expired tokens, and tokens from a rotated code in the lookup itself', async () => {
    expect(await readOfficeDevice('a'.repeat(64))).toBeNull();
    const sql=db.execute.mock.calls[0][0];
    expect(sql).toContain('a.revision = d.credential_revision'); expect(sql).toContain('d.revoked_at IS NULL');
    expect(sql).toContain('d.expires_at > UTC_TIMESTAMP()'); expect(sql).toContain('l.is_active = 1');
  });
  it('renews a remembered device after a day without retaining the setup code', async () => {
    device={id:'device',locationId:6,locationName:'Denver',renew:1};
    expect(await readOfficeDevice('b'.repeat(64))).toEqual(device);
    expect(db.execute.mock.calls.some(([sql])=>sql.includes('INTERVAL 365 DAY'))).toBe(true);
  });
  it('uses host-only secure HttpOnly cookies in production', () => {
    vi.stubEnv('NODE_ENV','production');
    expect(kioskCookieName()).toMatch(/^__Host-/);
    expect(kioskCookieOptions()).toMatchObject({httpOnly:true,secure:true,sameSite:'strict',path:'/'});
    expect(kioskCookieOptions()).not.toHaveProperty('domain'); vi.unstubAllEnvs();
  });
});
describe('office device boundary', () => {
  it('rejects direct legacy API calls without a device', async () => {
    const res=response(),next=vi.fn(); await requireOfficeDevice({params:{locationId:'1'},cookies:{}},res,next);
    expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
  });
  it('rejects a valid device when a caller changes the location ID', async () => {
    device={id:'device',locationId:6,renew:0};const res=response(),next=vi.fn();
    await requireOfficeDevice({params:{locationId:'1'},cookies:{[kioskCookieName()]:'a'.repeat(64)}},res,next);
    expect(res.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
  });
  it('grants only officeDevice context, never a staff user', async () => {
    device={id:'device',locationId:6,renew:0}; const req={params:{locationId:'6'},cookies:{[kioskCookieName()]:'a'.repeat(64)}};
    const next=vi.fn();await requireOfficeDevice(req,response(),next);expect(next).toHaveBeenCalledOnce();expect(req.user).toBeUndefined();
  });
  it.each([{ 'Sec-Fetch-Site':'cross-site' },{Origin:'https://evil.example',Host:'kiosk.auricwell.com'},{Origin:'null',Host:'kiosk.auricwell.com'}])('rejects cross-site setup or check-in', headers => {
    const res=response(),next=vi.fn();kioskSameOrigin({get:key=>headers[key]},res,next);expect(res.status.mock.calls[0]?.[0]||res.sendStatus.mock.calls[0]?.[0]).toBe(403);expect(next).not.toHaveBeenCalled();
  });
});
