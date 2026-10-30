import {it,expect} from 'vitest';
import {normalizePtoRequests} from '../submitSubmissionHistory.js';
it('identifies temporary school support separately from sick leave in submission history',()=>{
 const [row]=normalizePtoRequests([{id:1,request_type:'school_support',submission_key:'school_support_submission_1',total_hours:2,status:'approved',created_at:'2026-10-30'}]);
 expect(row.typeLabel).toBe('School Support Hours');expect(row.title).toBe('School Support Hours — Temporary — 2h');expect(row.title).not.toContain('Sick');
});
it('preserves the existing sick, training and linked school support labels',()=>{
 const rows=normalizePtoRequests([{request_type:'sick',total_hours:1},{request_type:'training',total_hours:2},{request_type:'school_support',total_hours:1}]);
 expect(rows.map(r=>r.title)).toEqual(['Sick leave — 1h','Training PTO — 2h','School Support Hours — 1h']);
});
