import { describe, expect, it } from 'vitest';
import { smsThreadKey, parseSmsThreadKey } from '../smsThreadIdentity.js';
const base = { clientId: 8, fromNumber: '+13035550101', toNumber: '(303) 555-0102', direction: 'outbound' };
describe('SMS phone-pair identity', () => {
  it('maps inbound and outbound to the same directional phone pair', () => {
    expect(smsThreadKey(base)).toBe(smsThreadKey({ ...base, fromNumber: base.toNumber, toNumber: base.fromNumber, direction: 'INBOUND' }));
  });
  it('separates changed care numbers and recipient numbers', () => {
    expect(smsThreadKey(base)).not.toBe(smsThreadKey({ ...base, fromNumber: '+13035550103' }));
    expect(smsThreadKey(base)).not.toBe(smsThreadKey({ ...base, toNumber: '+13035550103' }));
  });
  it('does not infer a send destination from legacy keys or missing phone numbers', () => {
    expect(parseSmsThreadKey('sms:client:8')).toBeNull();
    expect(smsThreadKey({ ...base, toNumber: null })).toBeNull();
    expect(parseSmsThreadKey(smsThreadKey(base))).toMatchObject({ clientId: 8, fromNumber: '+13035550101', toNumber: '+13035550102' });
  });
});
