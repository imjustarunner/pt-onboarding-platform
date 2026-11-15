import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:6}])}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findAll:vi.fn(async()=>[{id:6}])}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn(async()=>({ok:true,client:{id:2277,agency_id:6}}))}));
vi.mock('../billingEncounterClinical.service.js',()=>({enrichEncountersWithNoteSummary:vi.fn(async()=>[])}));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { documentationQueueProviderScope, listDocumentationQueue } from '../documentationQueue.service.js';

const request={reqUser:{id:501,role:'admin'},agencyId:6,clientId:2277,actualSessionsOnly:true};
const session={clinical_session_id:140,appointment_id:84,agency_id:6,client_id:2277,provider_user_id:999,
  office_event_id:null,billing_encounter_id:null,scheduled_start_at:'2026-11-15 15:00:00',service_code:'90837'};
beforeEach(()=>{
  vi.clearAllMocks();
  resolveClientRecordAccess.mockResolvedValue({ok:true,client:{id:2277,agency_id:6}});
  clinicalPool.execute.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[session]]:[[]]);
  pool.execute.mockImplementation(async sql=>{
    if(sql.includes('FROM clients'))return [[{id:2277,agency_id:6,full_name:'Example Client'}]];
    if(sql.includes('FROM agencies'))return [[{id:6,name:'NLU'}]];
    if(sql.includes('FROM users'))return [[{id:999,first_name:'Assigned',last_name:'Clinician'},{id:501,first_name:'Rendering',last_name:'Clinician'}]];
    return [[]];
  });
});

describe('actual client-session documentation queue',()=>{
  it.each(['admin','super_admin','supervisor'])('allows an authorized %s to view every provider for one client',async role=>{
    expect(await documentationQueueProviderScope({reqUser:{id:501,role},clientId:2277})).toBeNull();
    expect(resolveClientRecordAccess).toHaveBeenCalledWith({userId:501,role,clientId:2277});
  });
  it('keeps providers scoped to their own sessions and rejects another provider filter',async()=>{
    expect(await documentationQueueProviderScope({reqUser:{id:501,role:'provider'},clientId:2277})).toBe(501);
    await expect(documentationQueueProviderScope({reqUser:{id:501,role:'provider'},clientId:2277,providerUserId:999})).rejects.toMatchObject({status:403});
  });
  it('does not widen the general admin queue when no client was selected',async()=>{
    expect(await documentationQueueProviderScope({reqUser:{id:501,role:'admin'}})).toBe(501);
  });
  it('checks client record authorization before querying a client’s sessions',async()=>{
    resolveClientRecordAccess.mockResolvedValue({ok:false,status:403,message:'Client record access denied'});
    await expect(listDocumentationQueue(request)).rejects.toMatchObject({status:403});
    expect(clinicalPool.execute).not.toHaveBeenCalled();
  });
  it('returns another provider’s actual session for admin viewing with its assignment intact',async()=>{
    const result=await listDocumentationQueue(request);
    expect(result.items).toEqual([expect.objectContaining({clinicalSessionId:140,appointmentId:84,providerUserId:999,providerName:'Assigned Clinician'})]);
    const [sql,params]=clinicalPool.execute.mock.calls[0];
    expect(params).toEqual([6,2277]);
    expect(sql).not.toContain('cs.provider_user_id = ?');
    expect(sql.indexOf('cs.appointment_id IS NOT NULL')).toBeLessThan(sql.indexOf('LIMIT'));
  });
  it('excludes old synthetic note-only sessions from the actual-session chooser',async()=>{
    clinicalPool.execute.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[{...session,appointment_id:null}]]:[[]]);
    expect((await listDocumentationQueue(request)).items).toEqual([]);
  });
  it('uses the canonical author rather than a different billing renderer in actual-session selection',async()=>{
    clinicalPool.execute.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[{...session,rendering_provider_user_id:501}]]:[[]]);
    expect((await listDocumentationQueue(request)).items[0]).toMatchObject({providerUserId:999,providerName:'Assigned Clinician'});
    const providerRequest={...request,reqUser:{id:501,role:'provider'}};
    expect((await listDocumentationQueue(providerRequest)).items).toEqual([]);
    const sql=clinicalPool.execute.mock.calls.filter(([sql])=>sql.includes('FROM clinical_sessions')).at(-1)[0];
    expect(sql).toContain('AND cs.provider_user_id = ?');expect(sql).not.toContain('OR cs.rendering_provider_user_id = ?');
    expect((await listDocumentationQueue({...request,actualSessionsOnly:false})).items[0]).toMatchObject({providerUserId:501,providerName:'Rendering Clinician'});
  });
  it.each(['2026-11-16 02:30:00',new Date('2026-11-16T02:30:00Z')])('returns the saved local service date and exact timing for %s',async start=>{
    clinicalPool.execute.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[{...session,source_timezone:'America/Denver',scheduled_start_at:start,scheduled_end_at:'2026-11-16 03:30:00'}]]:[[]]);
    expect((await listDocumentationQueue(request)).items[0]).toMatchObject({dateOfService:'2026-11-15',sourceTimezone:'America/Denver',scheduledStartAt:'2026-11-16T02:30:00.000Z',scheduledEndAt:'2026-11-16T03:30:00.000Z'});
    expect(clinicalPool.execute.mock.calls[0][0]).toContain('cs.source_timezone');
  });
  it('preserves the calendar date of billing-only rows in the general queue',async()=>{
    clinicalPool.execute.mockResolvedValue([[]]);
    const normal=pool.execute.getMockImplementation();
    pool.execute.mockImplementation(async(sql,args)=>sql.includes('FROM billing_encounters be')?[[{...session,clinical_session_id:null,appointment_id:null,billing_encounter_id:75,scheduled_start_at:new Date('2026-11-15T00:00:00Z'),calendar_service_date:new Date('2026-11-15T00:00:00Z')}]]:normal(sql,args));
    expect((await listDocumentationQueue({...request,actualSessionsOnly:false})).items[0]).toMatchObject({dateOfService:'2026-11-15',scheduledStartAt:'2026-11-15',scheduledEndAt:null});
  });
  it('does not advertise main-database fallback rows for authoring when clinical storage is unavailable',async()=>{
    clinicalPool.execute.mockRejectedValue(Object.assign(new Error('Unavailable'),{code:'ECONNREFUSED'}));
    expect(await listDocumentationQueue(request)).toEqual({items:[],clinicalUnavailable:true});
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('does not advertise unverified main-database mappings when the actual clinical query is empty',async()=>{
    clinicalPool.execute.mockResolvedValue([[]]);
    expect((await listDocumentationQueue(request)).items).toEqual([]);
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('resolves an explicitly chosen older session before pagination while retaining client scope',async()=>{
    await listDocumentationQueue({...request,clinicalSessionId:140});
    const [sql,params]=clinicalPool.execute.mock.calls[0];
    expect(params).toEqual([6,2277,140]);
    expect(sql).toContain('cs.client_id = ?');expect(sql).toContain('cs.id = ?');
    expect(sql.indexOf('cs.id = ?')).toBeLessThan(sql.indexOf('LIMIT'));
  });
});
