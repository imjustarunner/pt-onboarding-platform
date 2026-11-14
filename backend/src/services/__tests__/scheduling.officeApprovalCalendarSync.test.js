import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),upsert:vi.fn(),deferred:[]}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../googleCalendar.service.js',()=>({default:{upsertBookedOfficeEvent:m.upsert}}));
vi.mock('../officeScheduleMaterializer.service.js',()=>({default:{}}));
import {queueOfficeEventGoogleSync} from '../providerAssignmentGoogleSync.service.js';
beforeEach(()=>{vi.clearAllMocks();m.deferred=[];m.execute.mockResolvedValue([{affectedRows:1}]);vi.stubGlobal('setImmediate',fn=>m.deferred.push(fn));});
afterEach(()=>vi.unstubAllGlobals());
it('persists the retry marker and releases approval before a slow Google call finishes',async()=>{
 let finish; m.upsert.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await queueOfficeEventGoogleSync(91);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("google_sync_status='PENDING'"),[91]);
 expect(m.upsert).not.toHaveBeenCalled();expect(m.deferred).toHaveLength(1);
 const job=m.deferred[0]();expect(m.upsert).toHaveBeenCalledWith({officeEventId:91});
 finish({ok:true});await job;
});
it('coalesces duplicate immediate tasks while retaining the durable retry path',async()=>{
 m.upsert.mockResolvedValue({ok:false,reason:'timeout'});
 await queueOfficeEventGoogleSync(92);await queueOfficeEventGoogleSync(92);
 expect(m.deferred).toHaveLength(1);await m.deferred[0]();
 await queueOfficeEventGoogleSync(92);expect(m.deferred).toHaveLength(2);await m.deferred[1]();
});
