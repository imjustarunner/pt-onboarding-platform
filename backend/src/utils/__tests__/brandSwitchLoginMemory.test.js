import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { signBrandSwitchMemory, readBrandSwitchMemory } from '../brandSwitchLoginMemory.js';
const secret = 'test-only-handoff-secret', jti = 'a'.repeat(64);
afterEach(() => vi.useRealTimers());
describe('brand switch sign-in memory', () => {
  it('preserves verified Google identity and remember consent through the one-time handoff', () => {
    const token = signBrandSwitchMemory({ jti, authMethod: 'google', rememberGoogle: true }, secret);
    expect(readBrandSwitchMemory(token, secret)).toEqual({ jti, authMethod: 'google', rememberGoogle: true });
    expect(jwt.decode(token)).not.toHaveProperty('id');
  });
  it('does not turn password or legacy handoffs into Google sign-ins', () => {
    const token = signBrandSwitchMemory({ jti, authMethod: 'password', rememberGoogle: true }, secret);
    expect(readBrandSwitchMemory(token, secret).authMethod).toBeNull();
    expect(readBrandSwitchMemory(jti, secret)).toEqual({ jti, authMethod: null, rememberGoogle: false });
  });
  it('keeps opting out distinct from using Google', () => {
    const token = signBrandSwitchMemory({ jti, authMethod: 'google', rememberGoogle: false }, secret);
    expect(readBrandSwitchMemory(token, secret)).toMatchObject({ authMethod: 'google', rememberGoogle: false });
  });
  it('rejects forged, unrelated and expired JWTs before using a database handoff', () => {
    const value = { jti, authMethod: 'google', rememberGoogle: true };
    expect(() => readBrandSwitchMemory(signBrandSwitchMemory(value, 'wrong-secret'), secret)).toThrow();
    expect(() => readBrandSwitchMemory(jwt.sign({ jti, id: 7 }, secret), secret)).toThrow();
    vi.useFakeTimers();
    const token = signBrandSwitchMemory(value, secret);
    vi.advanceTimersByTime(61000);
    expect(() => readBrandSwitchMemory(token, secret)).toThrow();
  });
});
