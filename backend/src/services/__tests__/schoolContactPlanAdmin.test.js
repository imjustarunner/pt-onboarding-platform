import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../schoolContactPlan.service.js',()=>({DEFAULT_SCHOOL_CONTACT_TEMPLATE:'Introduction template',isSchoolContactDemoAgency:a=>a?.id===450 && a?.slug==='auricwell-qa-demo' && a?.is_active===1}));
import {listSchoolContactPlanProviders,requireSchoolContactPlan} from '../schoolContactPlanAdmin.service.js';
let actor,agency;
beforeEach(()=>{
  vi.clearAllMocks();actor={id:1435};agency={id:450,slug:'auricwell-qa-demo',is_active:1};
  m.execute.mockImplementation(async(sql)=>{
    if(sql.startsWith('SELECT id,name,slug'))return [[agency]];
    if(sql.startsWith('SELECT u.id FROM users'))return [[actor].filter(Boolean)];
    if(sql.startsWith('SELECT u.id,u.first_name'))return [[{id:1433,status:'declined',required_by_admin:0}]];
    return [{affectedRows:1}];
  });
});
it('returns opted-out/setup status without client records or provider enrollment',async()=>{
  expect(await listSchoolContactPlanProviders({agencyId:450,userId:1435})).toEqual([expect.objectContaining({id:1433,status:'declined',required:false})]);
  expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('denies support or school-admin accounts that do not pass the agency-administrator lookup',async()=>{
  actor=null;
  await expect(listSchoolContactPlanProviders({agencyId:450,userId:1434})).rejects.toMatchObject({status:403});
  await expect(requireSchoolContactPlan({agencyId:450,userId:1465},1433,true)).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it.each([{id:2,slug:'auricwell-qa-demo',is_active:1},{id:450,slug:'another-tenant',is_active:1},{id:450,slug:'auricwell-qa-demo',is_active:0}])('refuses another or inactive tenant: %o',async row=>{
  agency=row;
  await expect(requireSchoolContactPlan({agencyId:row.id,userId:1435},1433,true)).rejects.toMatchObject({status:403});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('changes only the requirement; does not opt in a declined provider or change the opt-in cutoff',async()=>{
  await requireSchoolContactPlan({agencyId:450,userId:1435},1433,true);
  const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));
  expect(args).toEqual([450,1433,'Introduction template',1,1435]);
  const update=sql.split('ON DUPLICATE KEY UPDATE')[1];
  expect(update).not.toMatch(/status\s*=|decided_at\s*=|template\s*=/);
  expect(m.execute.mock.calls.some(([sql])=>/^(?:INSERT|UPDATE|DELETE)[\s\S]*(?:school_contact_workflows|communication_messages)/.test(sql))).toBe(false);
});
it('refuses a provider absent from the active assigned-school roster and a nonboolean flag',async()=>{
  await expect(requireSchoolContactPlan({agencyId:450,userId:1435},999,true)).rejects.toMatchObject({status:404});
  await expect(requireSchoolContactPlan({agencyId:450,userId:1435},1433,'true')).rejects.toMatchObject({status:400});
});
