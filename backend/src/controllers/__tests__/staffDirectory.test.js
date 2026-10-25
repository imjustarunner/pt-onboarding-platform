import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),agencies:vi.fn(),profiles:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies}}));
vi.mock('../publicAgencyServices.controller.js',()=>({listEnrolledProviders:m.profiles}));
vi.mock('../../utils/uploads.js',()=>({publicUploadsUrlFromStoredPath:value=>value || null}));
import {getStaffDirectory} from '../staff.controller.js';
let req,res,next;
beforeEach(()=>{
 vi.clearAllMocks();req={user:{id:1,role:'provider'},query:{agencyId:2}};
 res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();
 m.agencies.mockResolvedValue([{id:2}]);m.profiles.mockImplementation(async(_id,service)=>service==='counseling'?[{id:7}]:[]);
 m.execute.mockImplementation(async(sql)=>{
  if(sql.startsWith('SELECT id,slug'))return [[{id:2,slug:'itsco'}]];
  if(sql.includes('SELECT DISTINCT u.id'))return [[{id:7,first_name:'Example',last_name:'Staff',work_phone:'303-555-0100',work_phone_extension:'204',email:'private@example.test',personal_phone:'303-555-9999'}, {id:8,first_name:'Second',last_name:'Staff',email:'personal@example.test',personal_phone:'303-555-9998'}]];
  if(sql.includes('FROM user_office_locations'))return [[{user_id:7,is_primary:'0',name:'Secondary location'},{user_id:7,is_primary:1,name:'Denver'}]];
  if(sql.includes('FROM office_standing_assignments'))return [[{user_id:7,location:'Denver',room:'Office 2'}]];
  throw new Error('Unexpected query');
 });
});
describe('professional staff directory',()=>{
 it('returns only professional contacts, assigned offices and published profiles',async()=>{
  await getStaffDirectory(req,res,next);expect(next).not.toHaveBeenCalled();
  const {staff}=res.json.mock.calls[0][0];
  expect(staff[0]).toMatchObject({workPhone:'303-555-0100',extension:'204',workEmail:null,primaryLocation:'Denver',assignedOffices:['Denver · Office 2'],profileUrl:'https://www.itsco.health/providers/example-staff-7'});
  expect(staff[1]).toMatchObject({workPhone:null,workEmail:null,profileUrl:null});
  expect(JSON.stringify(staff)).not.toMatch(/private@|personal@|555-999|personal_phone/);
 });
 it.each(['client_guardian','school_staff','kiosk'])('denies %s accounts before querying directory data',async role=>{
  req.user.role=role;await getStaffDirectory(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(m.execute).not.toHaveBeenCalled();
 });
 it('denies a different organization even when the user is staff',async()=>{
  req.query.agencyId=99;await getStaffDirectory(req,res,next);expect(next.mock.calls[0][0]).toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();
 });
});
