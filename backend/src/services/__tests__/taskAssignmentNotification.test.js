import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({notice:vi.fn(),push:vi.fn(),email:vi.fn()}));
vi.mock('../../models/Notification.model.js',()=>({default:{coalesceOrCreate:mocks.notice}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../notificationDispatcher.service.js',()=>({default:{dispatchPushForNotification:mocks.push}}));
vi.mock('../taskAssignmentEmail.service.js',()=>({sendTaskAssignmentEmail:mocks.email}));
import {notifyTaskAssigned} from '../taskNotifications.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.push.mockResolvedValue({dispatched:true});mocks.email.mockResolvedValue({sent:true});mocks.notice.mockResolvedValue({id:30,type:'custom_task_assigned',user_id:7,agency_id:2,related_entity_type:'task',related_entity_id:11});});
const task={id:11,title:'PRIVATE TASK CONTENT',assigned_to_user_id:7,assigned_to_agency_id:2,status:'pending'};
it('keeps a specific task reference for in-app navigation and sends generic push plus assignment email',async()=>{
  await notifyTaskAssigned({task,actorUserId:9});expect(mocks.notice).toHaveBeenCalledWith(expect.objectContaining({relatedEntityType:'task',relatedEntityId:11,title:'New task assigned to you',userId:7}));expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({title:'New task assigned to you',message:'Sign in to view your task.',related_entity_id:11}));expect(mocks.email).toHaveBeenCalledWith({task,actorUserId:9});expect(JSON.stringify(mocks.push.mock.calls)).not.toContain('PRIVATE');
});
it('does not notify self-assigned, waiting or completed tasks',async()=>{
  for(const change of [{assigned_to_user_id:9},{status:'waiting'},{status:'completed'}])await notifyTaskAssigned({task:{...task,...change},actorUserId:9});expect(mocks.notice).not.toHaveBeenCalled();expect(mocks.email).not.toHaveBeenCalled();
});
it('preserves the in-app notification when email delivery fails',async()=>{mocks.email.mockRejectedValue(Object.assign(new Error('Synthetic failure'),{code:'TASK_SENDER_NOT_CONFIGURED'}));const log=vi.spyOn(console,'warn').mockImplementation(()=>{});await expect(notifyTaskAssigned({task,actorUserId:9})).resolves.toBeUndefined();expect(mocks.notice).toHaveBeenCalled();log.mockRestore();});
