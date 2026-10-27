import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m,onTableWrite:vi.fn()}));
import User from '../User.model.js';
beforeEach(()=>{
 vi.clearAllMocks();
 vi.spyOn(User,'findById').mockResolvedValue({id:7,email:'staff@example.test',role:'provider'});
 m.execute.mockImplementation(async sql=>sql.includes('INFORMATION_SCHEMA')?[[{COLUMN_NAME:'work_phone_extension'}]]:[{affectedRows:1}]);
});
afterEach(()=>vi.restoreAllMocks());
it.each([['Ext. Ext. 007','007'],['x204','204'],['',null]])('stores a canonical work extension when updating a profile: %s',async(input,expected)=>{
 await User.update(7,{workPhoneExtension:input});
 expect(m.execute).toHaveBeenCalledWith('UPDATE users SET work_phone_extension = ? WHERE id = ?',[expected,7]);
});
