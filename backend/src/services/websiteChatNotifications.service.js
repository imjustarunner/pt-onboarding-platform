import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import NotificationDispatcherService from './notificationDispatcher.service.js';
import { readAgencyAccess } from './agencyAccessProfiles.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { applyAgencyAccess } from '../utils/agencyAccessPolicy.js';

const roles = ['admin', 'support', 'super_admin'];

/** No visitor message, visitor token, address, or transcript is put in a notification. */
export function createWebsiteChatNotifications({ db = pool, access = readAgencyAccess,
  create = data => Notification.create(data), dispatch = notification => NotificationDispatcherService.dispatchPushForNotification(notification),
  channelEnabled = isNotificationChannelEnabled } = {}) {
  async function permitted(userId, agencyId) {
    const profile = await access(userId, agencyId);
    return !!profile && roles.includes(applyAgencyAccess({id:userId,role:profile.platformRole},profile).role);
  }
  async function enqueue({ sessionId, eventKey }) {
    const [[session]] = await db.execute(`SELECT c.id,s.support_agency_id AS agency_id FROM public_website_chat_sessions c
      JOIN public_website_support_sites s ON s.slug=c.site_slug WHERE c.id=? AND s.chat_enabled=1 AND s.coming_soon=0`, [sessionId]);
    if (!session) return;
    const [staff] = await db.execute(`SELECT DISTINCT u.id FROM public_website_chat_staff cs JOIN users u ON u.id=cs.user_id
      JOIN user_presence p ON p.user_id=u.id LEFT JOIN user_presence_status ps ON ps.user_id=u.id
      WHERE cs.last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND AND p.last_heartbeat_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_assistant_account,0)=0
      AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE') AND COALESCE(ps.status,'in_available') IN ('in_available','in_available_for_phone')`);
    for (const user of staff) {
      if (!await permitted(user.id, session.agency_id)) continue;
      await db.execute(`INSERT IGNORE INTO public_website_chat_notification_events(user_id,agency_id,session_id,event_key) VALUES(?,?,?,?)`,
        [user.id, session.agency_id, sessionId, String(eventKey).slice(0, 64)]);
    }
    await drain();
  }
  async function drain() {
    const [events] = await db.execute(`SELECT * FROM public_website_chat_notification_events WHERE completed_at IS NULL
      AND (locked_until IS NULL OR locked_until<UTC_TIMESTAMP()) ORDER BY id LIMIT 50`);
    for (const event of events) {
      const [claim] = await db.execute(`UPDATE public_website_chat_notification_events SET locked_until=UTC_TIMESTAMP()+INTERVAL 60 SECOND,attempts=attempts+1
        WHERE id=? AND completed_at IS NULL AND (locked_until IS NULL OR locked_until<UTC_TIMESTAMP())`, [event.id]);
      if (claim.affectedRows !== 1) continue;
      try {
        // Do not notify an employee after they have gone offline or lost access.
        const [[online]] = await db.execute(`SELECT 1 FROM public_website_chat_staff WHERE user_id=? AND last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND`, [event.user_id]);
        if (!online || !await permitted(event.user_id, event.agency_id)) {
          await db.execute('UPDATE public_website_chat_notification_events SET completed_at=UTC_TIMESTAMP(),last_error=? WHERE id=?', ['offline_or_access_changed', event.id]);
          continue;
        }
        // Recover a notification that was created before an interrupted worker committed its ID.
        const [[prior]] = await db.execute(`SELECT * FROM notifications WHERE user_id=? AND type='website_chat_waiting'
          AND JSON_UNQUOTE(JSON_EXTRACT(audience_json,'$.websiteChatEventId'))=? ORDER BY id LIMIT 1`, [event.user_id, String(event.id)]);
        const notification = prior || await create({ type: 'website_chat_waiting', severity: 'info', userId: event.user_id, agencyId: event.agency_id,
          title: 'Live Chat', message: 'A visitor is waiting for your support team.', relatedEntityType: 'website_chat_session', relatedEntityId: null,
          audienceJson: { websiteChatSessionId: event.session_id, websiteChatEventId: String(event.id) }, actorSource: 'website_chat' });
        await db.execute('UPDATE public_website_chat_notification_events SET notification_id=? WHERE id=?', [notification.id, event.id]);
        if (await channelEnabled({ userId: event.user_id, agencyId: event.agency_id, type: 'website_chat_waiting', channel: 'push' })) {
          // Existing durable device outbox retries native delivery. Browser push uses the normal dispatcher.
          await db.execute(`INSERT IGNORE INTO mobile_push_deliveries(device_session_id,source_kind,source_id,target_id)
            SELECT id,'notification',?,? FROM mobile_device_sessions WHERE user_id=? AND push_enabled=1 AND revoked_at IS NULL`,
            [notification.id, notification.id, event.user_id]);
          await dispatch(notification);
        }
        await db.execute('UPDATE public_website_chat_notification_events SET completed_at=UTC_TIMESTAMP(),locked_until=NULL,last_error=NULL WHERE id=?', [event.id]);
      } catch (error) {
        // Log a code only. Retry processing never logs transcript content.
        await db.execute('UPDATE public_website_chat_notification_events SET last_error=?,locked_until=UTC_TIMESTAMP()+INTERVAL 60 SECOND WHERE id=?',
          [String(error.code || 'notification_pending').slice(0, 80), event.id]);
      }
    }
  }
  return { enqueue, drain };
}
export const websiteChatNotifications = createWebsiteChatNotifications();
