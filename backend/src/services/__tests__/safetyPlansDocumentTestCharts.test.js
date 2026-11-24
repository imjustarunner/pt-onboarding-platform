import {expect,it,vi} from 'vitest';
import {createClinicalDocumentTestCharts} from '../clinicalDocumentTestCharts.service.js';
const s=vi.hoisted(()=>({connection:vi.fn(),create:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:s.connection}}));
vi.mock('../../models/Client.model.js',()=>({default:{create:s.create}}));
vi.mock('../staffCareEligibility.service.js',()=>({requireStaffCareEligibility:vi.fn()}));

const provider={id:17,role:'provider'};
function connect({allowed=true,existing=false}={}){
  let guardian=50,client=70;
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),
    execute:vi.fn(async(sql,values)=>{
      if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
      if(sql.includes('FROM agencies'))return [allowed?[{id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}}]:[]];
      if(sql.startsWith('SELECT id,role,is_demo'))return [existing?[{id:++guardian,role:'client_guardian',is_demo:1}]:[]];
      if(sql.startsWith('INSERT INTO users'))return [{insertId:++guardian}];
      if(sql.startsWith('SELECT user_id FROM user_agencies'))return [[{user_id:guardian}]];
      if(sql.includes('SELECT id,is_demo,created_by_user_id'))return [existing?[{id:++client,is_demo:1,created_by_user_id:17,provider_id:17,status:'ACTIVE'}]:[]];
      return [{}];
    })
  };
  s.connection.mockResolvedValue(db);
  s.create.mockReset().mockImplementation(async()=>({id:++client}));
  return db;
}

it('creates one unlinked adult and two siblings assigned to the signed-in provider',async()=>{
  const db=connect();
  expect((await createClinicalDocumentTestCharts(provider)).charts).toHaveLength(3);
  expect(s.create).toHaveBeenCalledTimes(3);
  expect(s.create.mock.calls.every(([data])=>data.agency_id===450&&data.is_demo&&data.created_by_user_id===17)).toBe(true);
  expect(s.create.mock.calls[0][0].guardian_portal_enabled).toBe(false);
  const [adultUpdate]=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE clients SET provider_id'));
  expect(adultUpdate[1]).toEqual([17,'qa.document.17.adult@example.com',71,450]);
  expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO client_guardians'))).toHaveLength(4);
  expect(db.commit).toHaveBeenCalledOnce();
});

it('requires QA membership and reuses a provider’s fixtures on repeat clicks',async()=>{
  const blocked=connect({allowed:false});
  await expect(createClinicalDocumentTestCharts(provider)).rejects.toMatchObject({status:403});
  expect(blocked.beginTransaction).not.toHaveBeenCalled();
  await expect(createClinicalDocumentTestCharts({...provider,demoMode:true})).rejects.toMatchObject({status:403});
  const existing=connect({existing:true});
  expect((await createClinicalDocumentTestCharts(provider)).charts).toHaveLength(3);
  expect(s.create).not.toHaveBeenCalled();
  expect(existing.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO users'))).toBe(false);
});
