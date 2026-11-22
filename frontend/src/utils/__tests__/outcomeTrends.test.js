import { describe, expect, it } from 'vitest';
import { outcomeTrendSeries } from '../outcomeTrends.js';
const row=(id,respondent,extra={})=>({id,clientId:41,measureId:'phq-9',version:'edition-1',questionnaire:{id:'phq-9',title:'PHQ-9'},respondent,recordedAt:`2026-11-${String(id).padStart(2,'0')}T10:00:00Z`,result:{complete:true,total:20-id},...extra});
describe('assessment trend provenance',()=>{
  it('keeps client, individual guardians and other reporters separate across sessions',()=>{
    const rows=[row(1,{type:'client',clientId:41}),row(2,{type:'client',clientId:41},{appointment:{id:99}}),row(3,{type:'guardian',userId:8,label:'Parent A'}),row(4,{type:'guardian',userId:9,label:'Parent B'}),row(5,{type:'other',label:'Relative',relationship:'Aunt'}),row(6,{type:'other',label:'Relative',relationship:'Uncle'})];
    const groups=outcomeTrendSeries(rows);expect(groups).toHaveLength(5);expect(groups[0].rows.map(r=>r.id)).toEqual([1,2]);
    expect(outcomeTrendSeries([...rows,row(7,{type:'client',clientId:41},{version:'edition-2'})])).toHaveLength(6);
  });
  it('connects Vanderbilt initial and follow-up only when core scoring and the same guardian match',()=>{
    const questionnaire={respondent:'caregiver',comparisonFamily:'vanderbilt-parent',comparisonVersion:'core-2002'};
    const rows=[row(1,{type:'guardian',userId:8},{measureId:'vanderbilt-initial',questionnaire}),row(2,{type:'guardian',userId:8},{measureId:'vanderbilt-follow-up',version:'different-full-form',questionnaire})];
    expect(outcomeTrendSeries(rows)).toHaveLength(1);
    rows.push(row(3,{type:'guardian',userId:9},{questionnaire}));expect(outcomeTrendSeries(rows)).toHaveLength(2);
    rows.push(row(4,{type:'guardian',userId:8},{questionnaire,result:{complete:false,total:null}}));expect(outcomeTrendSeries(rows)[0].rows).toHaveLength(2);
  });
  it('connects a guardian’s portal and live answers using their verified account ID',()=>{
    const questionnaire={respondent:'caregiver',title:'Parent PHQ'};
    const groups=outcomeTrendSeries([row(1,null,{questionnaire,source:'family_portal',respondentUserId:8}),row(2,{type:'guardian',userId:8,label:'Parent A'},{questionnaire})]);
    expect(groups).toHaveLength(1);expect(groups[0].rows).toHaveLength(2);
  });
  it('graphs independent PHQ modules without inventing a combined score',()=>{
    const result={complete:true,total:null,domains:{'Depression symptoms (0–27)':9,'Physical symptoms reported as bothersome (of 13)':4}};
    const series=outcomeTrendSeries([row(1,{type:'client',clientId:41},{measureId:'phq',result}),row(2,{type:'client',clientId:41},{measureId:'phq',result:{...result,domains:{'Depression symptoms (0–27)':5}}})]);
    expect(series).toHaveLength(2);expect(series[0].rows.map(r=>r.trendValue)).toEqual([9,5]);expect(series[0].rows[0].result.total).toBeNull();
  });
});
