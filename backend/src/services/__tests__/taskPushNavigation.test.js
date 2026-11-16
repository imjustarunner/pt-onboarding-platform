import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({push:vi.fn(),enabled:vi.fn(),preferences:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Notification.model.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:7,role:'staff'}))}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:2,slug:'itsco'}))}}));
vi.mock('../../models/UserPreferences.model.js',()=>({default:{findByUserId:mocks.preferences}}));
vi.mock('../pushNotification.service.js',()=>({sendPushToUser:mocks.push}));
vi.mock('../notificationPreferences.service.js',()=>({isNotificationChannelEnabled:mocks.enabled}));
import dispatcher from '../notificationDispatcher.service.js';
beforeEach(()=>{vi.clearAllMocks();mocks.preferences.mockResolvedValue({push_notifications_enabled:true});mocks.enabled.mockResolvedValue(true);mocks.push.mockResolvedValue({sent:1});});
const notification={id:30,type:'custom_task_assigned',user_id:7,agency_id:2,related_entity_type:'task',related_entity_id:11,title:'New task assigned to you',message:'Sign in to view your task.'};
it('opens a task on its organization app host from the push notification',async()=>{
 expect(await dispatcher.dispatchPushForNotification(notification)).toMatchObject({dispatched:true});expect(mocks.push).toHaveBeenCalledWith(7,expect.objectContaining({title:'New task assigned to you',url:'https://app.itsco.health/tasks?taskId=11'}));
});
it('honors device and notification-type push choices',async()=>{
 mocks.enabled.mockResolvedValue(false);expect(await dispatcher.dispatchPushForNotification(notification)).toMatchObject({dispatched:false});expect(mocks.push).not.toHaveBeenCalled();mocks.preferences.mockResolvedValue({push_notifications_enabled:false});expect(await dispatcher.dispatchPushForNotification(notification)).toMatchObject({dispatched:false});
});
