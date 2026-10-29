import { describe, it, expect } from 'vitest';
import { serviceDates, anniversary, awardStatus, agencyToday, dinnerInput } from '../employeeAwards.js';
describe('year award policy', () => {
  it('uses the earlier recorded start or first client date, never the hire pipeline timestamp', () => {
    expect(serviceDates({provider_start_date:'2023-01-01',first_client_date:'2023-03-01'}).award_start_date).toBe('2023-01-01');
    expect(serviceDates({provider_start_date:'2023-03-01',first_client_date:'2023-01-01'}).award_start_date).toBe('2023-01-01');
    expect(serviceDates({hired_at:'2020-01-01'}).award_start_date).toBeNull();
    expect(serviceDates({first_client_date:'2022-07-02'}).start_date).toBeNull();
    expect(serviceDates({provider_start_date:'2023-01-01',lifecycle_start_date:'2022-01-01'}).start_date).toBe('2022-01-01');
  });
  it('clamps leap day anniversaries and accepts real database Date objects', () => {
    expect(anniversary(new Date('2024-02-29T00:00:00Z'),1)).toBe('2025-02-28');
    expect(anniversary('2024-02-29',4)).toBe('2028-02-29');
    expect(anniversary('2024-02-30',1)).toBeNull();
  });
  it('keeps fulfillment history and requires a date before calling someone eligible', () => {
    expect(awardStatus({status:'gift_sent',milestone_date:'2027-01-01'},'2026-10-29')).toBe('gift_sent');
    expect(awardStatus({status:'upcoming',milestone_date:'2026-10-29'},'2026-10-29')).toBe('owed');
    expect(awardStatus({status:'owed',milestone_date:null},'2026-10-29')).toBe('upcoming');
  });
  it('uses the agency local day at the UTC boundary', () => {
    expect(agencyToday('America/Denver',new Date('2026-10-30T01:00:00Z'))).toBe('2026-10-29');
  });
  it('validates batch selection and dinner dates', () => {
    expect(()=>dinnerInput({milestoneIds:[1],scheduledOn:'2026-02-30'})).toThrow();
    expect(()=>dinnerInput({milestoneIds:[1],scheduledOn:'2026-10-29',scheduledTime:'25:00'})).toThrow();
    expect(()=>dinnerInput({milestoneIds:'1',scheduledOn:'2026-10-29'})).toThrow();
    expect(dinnerInput({milestoneIds:[1,1,2],scheduledOn:'2026-10-29'}).ids).toEqual([1,2]);
  });
});
