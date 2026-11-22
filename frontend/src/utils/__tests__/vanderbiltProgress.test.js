import { describe, it, expect } from 'vitest';
import { vanderbiltProgress } from '../vanderbiltProgress.js';
const row = (id, phase, total, reporter = 'Parent A', extra = {}) => ({ id, questionnaire: { respondent:'caregiver', comparisonFamily:'vanderbilt-parent',comparisonVersion:'nichq-2002-parent-core', phase }, recordedAt:`2026-11-${String(id).padStart(2,'0')}T12:00:00Z`, answers:{informant:reporter,medication:'2'},result:{complete:true,total,average:total ? 3 : 1}, ...extra });
describe('Vanderbilt history', () => {
  it('orders initial and follow-up reports in time and compares the common scores', () => {
    const series = vanderbiltProgress([row(3,'follow_up',10), row(1,'initial',30),row(2,'follow_up',20)]);
    expect(series).toHaveLength(1);
    expect(series[0].rows.map(r => r.id)).toEqual([1,2,3]);
    expect(series[0].rows[2]).toMatchObject({ baselineChange:-20, priorChange:-10,performanceChange:0 });
  });
  it('never merges different caregivers, portal identities, scoring versions, or anonymous manual reports', () => {
    const portal = {source:'family_portal',respondentUserId:101};
    const rows = [row(1,'initial',30),row(2,'follow_up',10,'Parent B'),row(3,'initial',30,'Parent A',portal),row(4,'follow_up',10,'Renamed Parent A',portal),row(5,'follow_up',10,'Parent A',{...portal,respondentUserId:102}),row(6,'follow_up',10,'')];
    const series = vanderbiltProgress(rows);
    expect(series).toHaveLength(4); expect(series.find(s => s.key.endsWith('guardian:101')).rows).toHaveLength(2);
    const changed = row(7,'follow_up',9); changed.questionnaire.comparisonVersion='new-core';
    expect(vanderbiltProgress([...rows,changed])).toHaveLength(5);
  });
  it('excludes incomplete reports and does not invent an initial baseline for follow-ups', () => {
    const series = vanderbiltProgress([row(1,'follow_up',12),row(2,'follow_up',9),row(3,'initial',null,'Parent A',{result:{complete:false,total:null,average:null}})]);
    expect(series[0].rows).toHaveLength(2);
    expect(series[0].rows[1]).toMatchObject({ baselineChange:null,priorChange:-3,performanceChange:null });
  });
});
