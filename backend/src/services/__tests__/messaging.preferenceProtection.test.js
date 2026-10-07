import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import UserPreferences from '../../models/UserPreferences.model.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[{user_id:7,notification_categories:{staff_communications_2:{choices:{polling:false}}}}]]:[{affectedRows:1}]);});
it('prevents generic preference saves forging or deleting signed choices',async()=>{
 await UserPreferences.update(7,{notification_categories:{staff_communications_2:null,staff_communications_3:{choices:{polling:true}},reminders:false}});
 const update=pool.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'));
 expect(update[0]).toContain('JSON_MERGE_PATCH');
 expect(JSON.parse(update[1][0])).toEqual({reminders:false});
});
it('ignores replacement values that could erase every signed record',async()=>{
 for(const notification_categories of [null,[],false,'{}']) await UserPreferences.update(7,{notification_categories});
 expect(pool.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'))).toHaveLength(0);
});
