import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn(),execute:vi.fn()}}));
vi.mock('../../models/Notification.model.js',()=>({default:{create:vi.fn(),setViewerState:vi.fn()}}));
vi.mock('../notificationDispatcher.service.js',()=>({default:{dispatchForNotification:vi.fn(),dispatchPushForNotification:vi.fn()}}));
vi.mock('../availabilityWindow.service.js',()=>({isUserAvailable:vi.fn()}));
vi.mock('../vacationScheduleSync.service.js',()=>({default:{isUserOnVacation:vi.fn()}}));
import pool from '../../config/database.js';
import Notification from '../../models/Notification.model.js';
import Dispatcher from '../notificationDispatcher.service.js';
import {isUserAvailable} from '../availabilityWindow.service.js';
import Vacation from '../vacationScheduleSync.service.js';
import {alertRequestedSupport,retryRequestedSupportAlerts} from '../smsRequestedSupport.service.js';
let db,request,staff,prior,acquired;
beforeEach(()=>{
 vi.resetAllMocks(); acquired=1; prior=[];
 request={id:50,agency_id:2,ticket_id:60,status:'open',claimed_by_user_id:null,alert_due:1};
 staff=[{id:8,role:'support'},{id:9,role:'support'},{id:10,role:'admin'}];
 db={release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired}]];
  if(sql.includes('FROM message_logs'))return [[request]];
  if(sql.includes('FROM users')){expect(args).toEqual([2]);return [staff];}
  if(sql.includes('FROM notifications'))return [prior];
  return [{affectedRows:1}];
 })};
 pool.getConnection.mockResolvedValue(db);pool.execute.mockResolvedValue([[{id:50}]]);
 Notification.create.mockImplementation(async data=>({...data,id:70}));
 isUserAvailable.mockResolvedValue({available:true});Vacation.isUserOnVacation.mockResolvedValue(false);
 Dispatcher.dispatchForNotification.mockResolvedValue({dispatched:true});Dispatcher.dispatchPushForNotification.mockResolvedValue({dispatched:true});
});
it('alerts available same-agency support, with urgent generic content and a ticket target',async()=>{
 await alertRequestedSupport(50);
 expect(Notification.create.mock.calls.map(([n])=>n.userId)).toEqual([8,9]);
 expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({severity:'urgent',relatedEntityType:'support_ticket',relatedEntityId:60,agencyId:2}));
 expect(Dispatcher.dispatchForNotification).toHaveBeenCalledTimes(2);
 expect(Dispatcher.dispatchPushForNotification).toHaveBeenCalledTimes(2);
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('supportAlertAttemptAt')&&sql.startsWith('UPDATE'))).toBe(true);
 expect(db.execute.mock.calls.some(([sql,args])=>sql.includes('RELEASE_LOCK')&&args[0]==='sms-support-alert:50')).toBe(true);
});
it('falls back to available admins when support is on vacation or outside work hours',async()=>{
 Vacation.isUserOnVacation.mockImplementation(async id=>id===8);
 isUserAvailable.mockImplementation(async id=>({available:id===10}));
 await alertRequestedSupport(50);
 expect(Notification.create.mock.calls.map(([n])=>n.userId)).toEqual([10]);
});
it('keeps in-app notice for admins and retries availability without waking off-duty staff',async()=>{
 isUserAvailable.mockResolvedValue({available:false});await alertRequestedSupport(50);
 expect(Notification.create.mock.calls.map(([n])=>n.userId)).toEqual([10]);
 expect(Dispatcher.dispatchForNotification).not.toHaveBeenCalled();expect(Dispatcher.dispatchPushForNotification).not.toHaveBeenCalled();
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE')&&sql.includes('supportAlertAttemptAt'))).toBe(false);
});
it.each([{claimed_by_user_id:8},{status:'closed'},{status:'answered'},{alert_due:0}])('stops reminders after claim/closure or inside cooldown: %j',async state=>{
 Object.assign(request,state);await alertRequestedSupport(50);
 expect(Notification.create).not.toHaveBeenCalled();expect(Dispatcher.dispatchForNotification).not.toHaveBeenCalled();
});
it('reminds an unclaimed request even if its existing notification was read; does not duplicate the in-app row',async()=>{
 prior=[{id:70,is_read:1}];await alertRequestedSupport(50);
 expect(Notification.create).not.toHaveBeenCalled();expect(Dispatcher.dispatchForNotification).toHaveBeenCalledWith(prior[0],{context:{isUrgent:true}});
 expect(Notification.setViewerState).toHaveBeenCalledWith(70,8,{read:false,dismissed:false,snoozedUntil:null});
});
it('continues push and other recipients if SMS fails',async()=>{
 Dispatcher.dispatchForNotification.mockRejectedValue(new Error('carrier unavailable'));await alertRequestedSupport(50);
 expect(Dispatcher.dispatchPushForNotification).toHaveBeenCalledTimes(2);expect(Notification.create).toHaveBeenCalledTimes(2);
});
it('does not dispatch concurrently on a second worker',async()=>{
 acquired=0;await alertRequestedSupport(50);expect(Notification.create).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
it('retries persisted unclaimed tickets on the worker, including after process restart',async()=>{
 await retryRequestedSupportAlerts();
 expect(pool.execute.mock.calls[0][0]).toContain('t.claimed_by_user_id IS NULL');
 expect(pool.execute.mock.calls[0][0]).toContain('INTERVAL 15 MINUTE');
 expect(Notification.create).toHaveBeenCalled();
});
