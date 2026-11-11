import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createSharedFamilyNotice } from '../sharedFamilyNotice.service.js';
import { FAMILY_COMMUNICATION_POLICY_VERSION as version } from '../../../../frontend/src/navigation/familyCommunicationPolicy.js';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';

// Deliberately cannot use DB_*: those can point at real client records.
describe.skipIf(!recoveryMysqlEnabled)('Shared first-send notice, isolated actual MySQL',()=>{
  let fixture, db, notice; const audit=vi.fn();
  beforeAll(async()=>{
    fixture=await isolatedWorkflowMysql('family_notice'); db=fixture.db;
    for(const sql of [
      `CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(40),status VARCHAR(40),is_active BOOLEAN,is_archived BOOLEAN,terminated_at DATETIME NULL)`,
      `CREATE TABLE agencies(id INT PRIMARY KEY,is_active BOOLEAN,is_archived BOOLEAN)`,
      `CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOLEAN)`,
      `CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT)`,
      `CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled BOOLEAN)`,
      `CREATE TABLE client_agency_assignments(client_id INT,agency_id INT,is_active BOOLEAN)`
    ]) await db.query(sql);
    await db.query(await fs.readFile(new URL('../../../../database/migrations/1793_shared_family_notice.sql',import.meta.url),'utf8'));
    notice=createSharedFamilyNotice({db,audit});
  });
  afterAll(async()=>fixture?.close());
  beforeEach(async()=>{
    for(const table of ['secure_family_communication_acknowledgments','users','agencies','user_agencies','clients','client_guardians','client_agency_assignments'])await db.query(`DELETE FROM ${table}`);
    audit.mockClear();
    await db.query(`INSERT INTO users VALUES (1,'provider','ACTIVE',1,0,NULL),(2,'client_guardian','ACTIVE',1,0,NULL),(3,'client','ACTIVE',1,0,NULL),(4,'provider','EHR_ONLY',1,0,NULL)`);
    await db.query(`INSERT INTO agencies VALUES (450,1,0),(451,1,0)`);
    await db.query(`INSERT INTO user_agencies VALUES (1,450,1),(4,450,1)`);
    await db.query(`INSERT INTO clients VALUES (11,450),(12,451)`);
    await db.query(`INSERT INTO client_guardians VALUES (11,2,1),(12,3,1)`);
  });
  it('blocks before first send with scoped/versioned409 and grants no rights',async()=>{
    await expect(notice.requireAck({userId:2,agencyId:450})).rejects.toMatchObject({status:409,code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:450,version});
    const state=await notice.read({userId:2,agencyId:450});expect(state).toMatchObject({acknowledged:false,grantsAccess:false});
    expect(state.notice.statements.join(' ')).toContain('added later');expect(state.notice.statements.join(' ')).toContain('not therapy');
  });
  it('persists exactly one explicit acknowledgment with hashed evidence under concurrent retries',async()=>{
    const input={userId:2,agencyId:450,version,acknowledged:true,req:{ip:'127.0.0.1',headers:{'user-agent':'Synthetic QA browser'}}};
    await Promise.all([notice.acknowledge(input),notice.acknowledge(input)]);
    const [rows]=await db.query('SELECT * FROM secure_family_communication_acknowledgments');expect(rows).toHaveLength(1);expect(rows[0].ip_hash).toMatch(/^[a-f0-9]{64}$/);expect(rows[0].user_agent_hash).not.toContain('Synthetic');
    expect(audit).toHaveBeenCalledTimes(1);expect(audit.mock.calls[0][0].metadata).toEqual({policyVersion:version,accessGranted:false});
    await expect(notice.requireAck(input)).resolves.toMatchObject({acknowledged:true});
  });
  it('does not treat an old policy version or a nonboolean checkbox as acceptance',async()=>{
    for(const altered of [{version:'old',acknowledged:true},{version,acknowledged:'true'},{version,acknowledged:false}])await expect(notice.acknowledge({userId:1,agencyId:450,...altered})).rejects.toMatchObject({status:400});
    await db.execute(`INSERT INTO secure_family_communication_acknowledgments(user_id,agency_id,policy_version) VALUES(1,450,'old')`);
    await expect(notice.requireAck({userId:1,agencyId:450})).rejects.toMatchObject({status:409});
  });
  it('rechecks account and relationship after acceptance; no acknowledgment can restore access',async()=>{
    await notice.acknowledge({userId:2,agencyId:450,version,acknowledged:true});
    await db.query('UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=2');
    await expect(notice.requireAck({userId:2,agencyId:450})).rejects.toMatchObject({status:403});
    await db.query('UPDATE users SET is_archived=1 WHERE id=1');await expect(notice.read({userId:1,agencyId:450})).rejects.toMatchObject({status:403});
    await db.query("UPDATE users SET terminated_at=NOW() WHERE id=4");await expect(notice.read({userId:4,agencyId:450})).rejects.toMatchObject({status:403});
  });
  it('scopes family, self-client and EHR accounts to actual active affiliations',async()=>{
    await expect(notice.read({userId:1,agencyId:451})).rejects.toMatchObject({status:403});
    await expect(notice.read({userId:2,agencyId:451})).rejects.toMatchObject({status:403});
    await expect(notice.read({userId:3,agencyId:451})).resolves.toMatchObject({acknowledged:false});
    await expect(notice.read({userId:4,agencyId:450})).resolves.toMatchObject({acknowledged:false});
    await db.query('INSERT INTO client_agency_assignments VALUES (12,450,1)');
    await expect(notice.read({userId:3,agencyId:450})).resolves.toMatchObject({agencyId:450});
    await db.query('UPDATE agencies SET is_active=0 WHERE id=450');await expect(notice.read({userId:3,agencyId:450})).rejects.toMatchObject({status:403});
  });
});
