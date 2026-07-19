import { describe, expect, it } from 'vitest';
import {
  isDualRateContractPilotUser,
  isHourlyDualRateEnabled,
  normalizeEmployeeNumber,
  normalizePayBucket
} from '../hourlyDualRateContract.js';

describe('hourlyDualRateContract', () => {
  it('normalizes EMP-0485 style IDs', () => {
    expect(normalizeEmployeeNumber('EMP-0485')).toBe('485');
    expect(normalizeEmployeeNumber('0485')).toBe('485');
    expect(normalizeEmployeeNumber('485')).toBe('485');
  });

  it('detects the dual-rate pilot user', () => {
    expect(isDualRateContractPilotUser({ id: 485 })).toBe(true);
    expect(isDualRateContractPilotUser({ employee_id: 'EMP-0485' })).toBe(true);
    expect(isDualRateContractPilotUser({ employeeId: '0485' })).toBe(true);
    expect(isDualRateContractPilotUser({ id: 12, employee_id: 'EMP-0012' })).toBe(false);
  });

  it('reads dual-rate enabled flag', () => {
    expect(isHourlyDualRateEnabled({ hourly_dual_rate_enabled: 1 })).toBe(true);
    expect(isHourlyDualRateEnabled({ hourlyDualRateEnabled: true })).toBe(true);
    expect(isHourlyDualRateEnabled({ hourly_dual_rate_enabled: 0 })).toBe(false);
  });

  it('normalizes pay buckets', () => {
    expect(normalizePayBucket('other_1')).toBe('other_1');
    expect(normalizePayBucket('OTHER_1')).toBe('other_1');
    expect(normalizePayBucket('indirect')).toBe('indirect');
    expect(normalizePayBucket('')).toBe('indirect');
  });
});
