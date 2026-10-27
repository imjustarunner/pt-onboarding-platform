import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),lock:vi.fn(),release:vi.fn(),drain:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection}}));
vi.mock('../sessionNotification.service.js',()=>({processDueSessionNotifications:m.drain}));
import {runQaSessionNotificationTick} from '../qaSessionNotificationWorker.service.js';
const agency={id:450,slug:'auricwell-qa-demo',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true}}};
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[agency]]);m.connection.mockResolvedValue({execute:m.lock,release:m.release});m.lock.mockResolvedValue([[{acquired:1}]]);});
it('drains only the explicitly isolated demo and releases its cross-replica lock',async()=>{
 await runQaSessionNotificationTick();
 expect(m.drain).toHaveBeenCalledExactlyOnceWith({agencyId:450,limit:50});
 expect(m.lock).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK('qa_session_notifications:450')");expect(m.release).toHaveBeenCalledOnce();
});
it.each([null,{...agency,id:2},{...agency,slug:'itsco'},{...agency,is_active:0},{...agency,is_archived:1},{...agency,feature_flags:null}])('fails closed for an ineligible tenant %j',async value=>{
 m.execute.mockResolvedValue([[value]]);await runQaSessionNotificationTick();expect(m.drain).not.toHaveBeenCalled();expect(m.connection).not.toHaveBeenCalled();
});
it('does not duplicate work on another replica',async()=>{m.lock.mockResolvedValue([[{acquired:0}]]);await runQaSessionNotificationTick();expect(m.drain).not.toHaveBeenCalled();expect(m.release).toHaveBeenCalledOnce();});
it('releases the lock on transport failure',async()=>{m.drain.mockRejectedValue(Error('transport failed'));await expect(runQaSessionNotificationTick()).rejects.toThrow('transport failed');expect(m.release).toHaveBeenCalledOnce();expect(m.lock).toHaveBeenCalledTimes(2);});
