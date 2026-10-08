import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {staffStartDate,fillStaffMarkers} from '../staffMilestonePresentation.service.js';
it('uses timeline start then legacy start then first client, never record creation',()=>{
 expect(staffStartDate({timeline_start_date:'2025-01-02',provider_start_date:'2024-01-01',first_client_date:'2023-01-01'})).toBe('2025-01-02');
 expect(staffStartDate({first_client_date:'2024-05-06',created_at:'2020-01-01'})).toBe('2024-05-06');
 expect(staffStartDate({created_at:'2020-01-01'})).toBeNull();
});
it('refreshes the marked dates while retaining edited prose',()=>{
 const body='Welcome! {{staff:5:startDate}} {{staff:5:tenure}}';
 expect(fillStaffMarkers(body,[{id:5,timeline_start_date:'2025-10-09'}],new Date('2026-10-08'))).toContain('Welcome! Start date: 10-09-2025 <strong>0 years!</strong>');
 expect(fillStaffMarkers(body,[{id:5,timeline_start_date:'2024-10-01'}],new Date('2026-10-08'))).toContain('2 years');
});
