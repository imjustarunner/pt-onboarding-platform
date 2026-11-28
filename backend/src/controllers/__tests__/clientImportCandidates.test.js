import { DatabaseSync } from 'node:sqlite';
import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),membership:vi.fn(),audit:vi.fn(),connection:vi.fn(),begin:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../../services/enrollmentAgencyAccess.service.js',()=>({assertEnrollmentAgencyMembership:m.membership}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
vi.mock('../../services/clientChartImportProgress.service.js',()=>({beginClientChartImport:m.begin}));
vi.mock('../../services/officeBillingSites.service.js',()=>({ensureSchoolServiceLocation:vi.fn()}));
vi.mock('../../services/clientServiceEnrollment.service.js',()=>({ensureClientService:vi.fn()}));
vi.mock('../../services/clientImportSchoolSetup.service.js',()=>({syncClientImportSchoolSetup:vi.fn()}));
import {getClientImportCandidates,mergeClientRecordsImport} from '../clientImportCandidates.controller.js';
const request=()=>({user:{id:7,role:'support'},get:()=> '6',body:{fullName:'Example Child',dateOfBirth:'2015-01-01',email:'parent@example.test',phone:'303-555-0101',addressStreet:'1 Test St',addressZip:'80202'}});
function response(){return {set:vi.fn().mockReturnThis(),json:vi.fn()};}
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{id:1,full_name:'Example Child',date_of_birth:'2015-01-01',status:'ACTIVE'},{id:2,full_name:'Sibling Example',date_of_birth:'2013-01-01',status:'ACTIVE'}]]);});
it('limits results to the authorized agency and distinguishes duplicate from household suggestions',async()=>{
 const req=request(),res=response(),next=vi.fn();await getClientImportCandidates(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(m.membership).toHaveBeenCalledWith(req.user,6);
 const [sql,args]=m.execute.mock.calls[0];expect(sql).toContain('WHERE c.agency_id=? AND (');expect(sql).toContain('LIMIT 25');expect(sql).toContain('ac.agency_id=c.agency_id');expect(args[0]).toBe(6);expect(args).toContain('+13035550101');
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({candidates:[expect.objectContaining({id:1,kind:'possible_duplicate',canMerge:true}),expect.objectContaining({id:2,kind:'shared_household',canMerge:false})]});expect(JSON.stringify(m.audit.mock.calls[0][1])).not.toContain('parent@example.test');
});
it('does not query clients for an unauthorized agency or clinical-only actor',async()=>{
 m.membership.mockRejectedValueOnce(Object.assign(Error('Forbidden'),{status:403}));const next=vi.fn();await getClientImportCandidates(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();
 await getClientImportCandidates({...request(),user:{id:7,role:'provider'}},response(),next);expect(m.execute).not.toHaveBeenCalled();
});
it('returns no suggestions for empty identifiers and rejects a missing agency',async()=>{
 const req=request(),res=response(),next=vi.fn();req.body={};await getClientImportCandidates(req,res,next);expect(res.json).toHaveBeenCalledWith({candidates:[]});expect(m.execute).not.toHaveBeenCalled();await getClientImportCandidates({...req,get:()=>''},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
});

function proposedMerge(overrides={}) {
 const req=request();
 req.params={id:1};
 req.body={...req.body,confirmed:true,expectedName:'Example Child',expectedDateOfBirth:'2015-01-01',...overrides};
 return req;
}
function mockChart(overrides={}) {
 const row={id:1,agency_id:6,full_name:'Example Child',date_of_birth:'2015-01-01',status:'ACTIVE',organization_id:42,client_type:'school',...overrides};
 const db={execute:vi.fn().mockResolvedValueOnce([[row]]).mockResolvedValue([{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 m.connection.mockResolvedValue(db);
 return db;
}
it('begins import on an existing school chart without applying a different school from a stale importer',async()=>{
 const db=mockChart();
 const res=response(),next=vi.fn();
 await mergeClientRecordsImport(proposedMerge({schoolOrganizationId:99}),res,next);
 expect(next).not.toHaveBeenCalled();
 expect(db.execute.mock.calls[0][0]).toContain('WHERE c.id=? AND c.agency_id=?');
 expect(m.begin).toHaveBeenCalledWith({clientId:1,agencyId:6},[],7,{db});
 expect(res.json).toHaveBeenCalledWith({id:1,agency_id:6,organization_id:42,client_type:'school'});
 expect(db.commit).toHaveBeenCalledOnce();
 expect(db.execute).toHaveBeenCalledTimes(1);
});
it.each([
 [{records_import_status:'complete'},{}], [{compliance_archived_at:'2026-11-24 00:00:00'},{}], [{status:'ARCHIVED'},{}],
 [{},{expectedName:'Wrong chart'}], [{},{dateOfBirth:'2015-01-02'}], [{},{dateOfBirth:''}],
 [{},{fullName:'Sibling Example',dateOfBirth:'2013-01-01'}]
])('rejects a completed, archived, stale, or different chart',async (stored,incoming)=>{
 const db=mockChart(stored),next=vi.fn();
 await mergeClientRecordsImport(proposedMerge(incoming),response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 expect(db.rollback).toHaveBeenCalledOnce();
 expect(db.commit).not.toHaveBeenCalled();
 expect(m.begin).not.toHaveBeenCalled();
});

it('does not offer a merge when two clients share a birth date and surname but have different first names', async () => {
 m.execute.mockResolvedValue([[{id:2,full_name:'Another Child',date_of_birth:'2015-01-01',status:'ACTIVE'}]]);
 const res=response(),next=vi.fn();
 await getClientImportCandidates(request(),res,next);
 expect(next).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith({candidates:[expect.objectContaining({id:2,canMerge:false})]});
 const [sql]=m.execute.mock.calls[0];
 expect(sql).toContain('c.date_of_birth=? AND LOWER(TRIM(c.full_name)) LIKE LOWER(?)');
 expect(sql).not.toContain('OR c.date_of_birth=?');
 const db=mockChart({full_name:'Another Child'});
 await mergeClientRecordsImport(proposedMerge({expectedName:'Another Child'}),response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 expect(db.commit).not.toHaveBeenCalled();
});

it('offers a merge for matching birth dates and truncated first and last names', async () => {
 m.execute.mockResolvedValue([[{id:2,full_name:'Exa Chi',date_of_birth:'2015-01-01',status:'ACTIVE'}]]);
 const res=response();
 await getClientImportCandidates(request(),res,vi.fn());
 expect(res.json).toHaveBeenCalledWith({candidates:[expect.objectContaining({id:2,canMerge:true})]});
});

it('runs the lookup and selects an existing chart against a clients schema without is_archived', async () => {
 const db = new DatabaseSync(':memory:');
 try {
  db.exec(`
    CREATE TABLE agencies (id INTEGER PRIMARY KEY, is_active INTEGER, is_archived INTEGER);
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY, agency_id INTEGER, full_name TEXT, date_of_birth TEXT,
      status TEXT, compliance_archived_at TEXT, address_street TEXT, address_zip TEXT, email TEXT,
      client_status_id INTEGER, onboarding_docs_json TEXT, organization_id INTEGER, client_type TEXT, provider_id INTEGER
    );
    CREATE TABLE client_statuses (id INTEGER PRIMARY KEY, status_key TEXT);
    CREATE TABLE client_guardians (client_id INTEGER, guardian_user_id INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, role TEXT);
    CREATE TABLE client_contact_affiliations (client_id INTEGER, agency_contact_id INTEGER);
    CREATE TABLE agency_contacts (id INTEGER PRIMARY KEY, agency_id INTEGER, phone TEXT);
    INSERT INTO agencies VALUES (6, 1, 0), (9, 1, 0);
    INSERT INTO clients (id, agency_id, full_name, date_of_birth, status, compliance_archived_at, address_street, address_zip, organization_id, client_type)
      VALUES (1, 6, 'Example Child', '2015-01-01', 'ACTIVE', NULL, '1 Test St', '80202', 42, 'school'),
             (2, 6, 'Another Child', '2012-01-01', 'ACTIVE', NULL, '1 Test St', '80202', 42, 'school'),
             (3, 9, 'Example Child', '2015-01-01', 'ACTIVE', NULL, '1 Test St', '80202', NULL, 'clinical');
  `);
  // SQLite returns JSON strings unquoted and uses its own locking syntax.
  const execute = (sql, params) => {
   const query = sql.replace(/JSON_UNQUOTE\((JSON_EXTRACT\([^)]+\))\)/g, '$1').replace(/ FOR UPDATE$/, '');
   return [db.prepare(query).all(...params)];
  };
  m.execute.mockImplementation(execute);
  m.connection.mockResolvedValue({execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()});

  const matches = response(), next = vi.fn();
  await getClientImportCandidates(request(), matches, next);
  expect(next).not.toHaveBeenCalled();
  expect(matches.json).toHaveBeenCalledWith({candidates:[
    expect.objectContaining({id:1,canMerge:true}),
    expect.objectContaining({id:2,canMerge:false,kind:'shared_household',reason:expect.stringContaining('possible household connection')})
  ]});

  const merge = response();
  await mergeClientRecordsImport(proposedMerge(), merge, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.begin).toHaveBeenCalledWith({clientId:1,agencyId:6},[],7,expect.anything());
  expect(merge.json).toHaveBeenCalledWith({id:1,agency_id:6,organization_id:42,client_type:'school'});

  db.exec("UPDATE clients SET compliance_archived_at='2026-11-24 00:00:00' WHERE id=1");
  const { syncClientImportSchoolSetup } = await vi.importActual('../../services/clientImportSchoolSetup.service.js');
  await expect(syncClientImportSchoolSetup({clientId:1,agencyId:6},7)).resolves.toBeNull();
 } finally {
  db.close();
 }
});
