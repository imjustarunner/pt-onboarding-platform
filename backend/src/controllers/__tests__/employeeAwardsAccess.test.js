import {beforeEach,describe,it,expect,vi} from 'vitest';
const {model,user}=vi.hoisted(()=>({model:{findById:vi.fn(),notes:vi.fn(),addNote:vi.fn(),createDinner:vi.fn(),attendance:vi.fn(),saveDefinition:vi.fn()},user:{getAgencies:vi.fn()}}));
vi.mock('../../models/EmployeeServiceMilestone.model.js',()=>({default:model}));
vi.mock('../../models/User.model.js',()=>({default:user}));
import {addNote,createDinner,saveGift,updateAttendance} from '../employeeRelations.controller.js';
beforeEach(()=>{vi.resetAllMocks();user.getAgencies.mockResolvedValue([{id:2}]);});
const res=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
describe('year award agency boundaries',()=>{
 it('blocks notes on another agency award',async()=>{model.findById.mockResolvedValue({id:99,agency_id:6});const next=vi.fn();await addNote({user:{id:507,role:'admin'},params:{id:'99'},body:{note:'test'}},res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(model.addNote).not.toHaveBeenCalled();});
 it.each([createDinner,saveGift,updateAttendance])('blocks agency mutations outside membership',async handler=>{const next=vi.fn();await handler({user:{id:507,role:'admin'},query:{agencyId:'6'},params:{years:'2',dinnerId:'1',id:'99'},body:{}},res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(model.createDinner).not.toHaveBeenCalled();expect(model.attendance).not.toHaveBeenCalled();expect(model.saveDefinition).not.toHaveBeenCalled();});
 it('passes the authorized agency through to dinner attendance updates',async()=>{const next=vi.fn();await updateAttendance({user:{id:507,role:'admin'},query:{agencyId:'2'},params:{dinnerId:'1',id:'99'},body:{attendance:'attended'}},res(),next);expect(model.attendance).toHaveBeenCalledWith(2,1,99,'attended',507);expect(next).not.toHaveBeenCalled();});
});
