import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({main:vi.fn(),clinical:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../billingReportIngest.service.js',()=>({listBillingEncountersForClient:vi.fn(async()=>[])}));
vi.mock('../../utils/noteAidClientAgency.js',()=>({collectChartScope:vi.fn(async()=>({agencyIds:[2],clientIds:[5]}))}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:value=>value}));
import {listClientMedicalRecordRows} from '../medicalRecordList.service.js';
it('lists the actual imported intake as a nonbillable document with source date and no fabricated visit or claim',async()=>{
 m.main.mockImplementation(async sql=>sql.includes('client_intake_note_drafts')?[[{id:12,client_id:5,agency_id:2,status:'draft',service_code:'H0031',session_context_enc:JSON.stringify({source:'client_records_import',nonBillable:true}),scrubbed_input_enc:'Intake Date: 7/29/2026',created_at:'2026-11-17'}]]:sql.includes('SELECT timezone')?[[{timezone:'America/Denver'}]]:[[]]);m.clinical.mockResolvedValue([[]]);
 expect(await listClientMedicalRecordRows({agencyId:2,clientId:5})).toEqual([expect.objectContaining({record_key:'intake:12',intake_draft_id:12,source_client_id:5,service_date:'2026-07-29',created_at:'2026-11-17',non_billable:true,clinical_session_id:null,clinical_note_id:null})]);
 expect(m.main.mock.calls.find(([sql])=>sql.includes('client_intake_note_drafts'))).toEqual([expect.stringContaining("status!='failed'"),[5,2]]);expect(m.clinical.mock.calls.some(([sql])=>/INSERT|UPDATE/.test(sql))).toBe(false);
});

it('cuts off upcoming and ongoing sessions before querying the newest medical record entries', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T02:00:00Z'));
  try {
    m.main.mockClear();
    m.clinical.mockClear();
    m.main.mockImplementation(async sql => {
      if (sql.includes('SELECT timezone')) return [[{ timezone: 'America/Denver' }]];
      if (sql.includes('FROM appointments a')) return [[
        { id: 9, client_id: 5, agency_id: 2, provider_user_id: 8, start_at: '2026-11-22 01:30:00', end_at: '2026-11-22 02:30:00', status: 'confirmed', service_code: '90837' },
        { id: 8, client_id: 5, agency_id: 2, provider_user_id: 8, start_at: '2026-11-21 22:00:00', end_at: '2026-11-21 23:00:00', status: 'completed', service_code: '90837' }
      ]];
      return [[]];
    });
    m.clinical.mockResolvedValue([[]]);
    const rows = await listClientMedicalRecordRows({ agencyId: 2, clientId: 5, limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].appointment_id).toBe(8);
    expect(m.main.mock.calls.find(([sql]) => sql.includes('FROM appointments a'))[0]).toMatch(/UTC_TIMESTAMP\(\)[\s\S]+LIMIT 1/);
    expect(m.clinical.mock.calls.find(([sql]) => sql.includes('FROM clinical_sessions cs'))[0]).toMatch(/UTC_TIMESTAMP\(\)[\s\S]+LIMIT 1/);
  } finally { vi.useRealTimers(); }
});
