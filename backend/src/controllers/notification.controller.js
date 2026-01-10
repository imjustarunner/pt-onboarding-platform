import Notification from '../models/Notification.model.js';
import NotificationService from '../services/notification.service.js';
import User from '../models/User.model.js';

export const getNotifications = async (req, res, next) => {
  try {
    const { agencyId, type, isRead, isResolved } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine which agencies the user can access
    let accessibleAgencyIds = [];
    
    if (userRole === 'super_admin') {
      // Super admin can see all agencies
      if (agencyId) {
        accessibleAgencyIds = [parseInt(agencyId)];
      } else {
        // Get all agencies
        const pool = (await import('../config/database.js')).default;
        const [agencies] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
        accessibleAgencyIds = agencies.map(a => a.id);
      }
    } else if (userRole === 'supervisor') {
      // Supervisors can only see notifications for their assigned supervisees
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }

      if (accessibleAgencyIds.length === 0) {
        return res.json([]);
      }

      // Get all supervisee IDs across all agencies
      const allSuperviseeIds = [];
      for (const agencyId of accessibleAgencyIds) {
        const superviseeIds = await SupervisorAssignment.getSuperviseeIds(userId, agencyId);
        allSuperviseeIds.push(...superviseeIds);
      }

      // Get notifications for all accessible agencies, then filter by supervisee IDs
      const allNotifications = [];
      for (const agencyId of accessibleAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          type: type || undefined,
          isRead: isRead !== undefined ? isRead === 'true' : undefined,
          isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
        });
        // Filter to only notifications for assigned supervisees
        const filteredNotifications = notifications.filter(n => 
          n.user_id && allSuperviseeIds.includes(n.user_id)
        );
        allNotifications.push(...filteredNotifications);
      }

      // Sort by created_at descending
      allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.json(allNotifications);
    } else if (userRole === 'clinical_practice_assistant') {
      // CPAs can see all notifications for all users in their agencies
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }

      if (accessibleAgencyIds.length === 0) {
        return res.json([]);
      }

      // Get notifications for all accessible agencies (CPAs see all notifications for their agencies)
      const allNotifications = [];
      for (const agencyId of accessibleAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          type: type || undefined,
          isRead: isRead !== undefined ? isRead === 'true' : undefined,
          isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
        });
        allNotifications.push(...notifications);
      }

      // Sort by created_at descending
      allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return res.json(allNotifications);
    } else {
      // Admin/support can only see their agencies
      const userAgencies = await User.getAgencies(userId);
      accessibleAgencyIds = userAgencies.map(a => a.id);
      
      // If specific agency requested, verify access
      if (agencyId) {
        const requestedAgencyId = parseInt(agencyId);
        if (!accessibleAgencyIds.includes(requestedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
        accessibleAgencyIds = [requestedAgencyId];
      }
    }

    if (accessibleAgencyIds.length === 0) {
      return res.json([]);
    }

    // Get notifications for all accessible agencies
    const allNotifications = [];
    for (const agencyId of accessibleAgencyIds) {
      const notifications = await Notification.findByAgency(agencyId, {
        type: type || undefined,
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        isResolved: isResolved !== undefined ? isResolved === 'true' : undefined
      });
      allNotifications.push(...notifications);
    }

    // Sort by created_at descending
    allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(allNotifications);
  } catch (error) {
    next(error);
  }
};

export const getNotificationCounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let agencyIds = [];
    
    if (userRole === 'super_admin') {
      // Super admin can see all agencies
      const pool = (await import('../config/database.js')).default;
      const [agencies] = await pool.execute('SELECT id FROM agencies WHERE is_active = TRUE');
      agencyIds = agencies.map(a => a.id);
    } else if (userRole === 'supervisor') {
      // Supervisors can only see notification counts for their assigned supervisees
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(userId);
      const allAgencyIds = userAgencies.map(a => a.id);
      
      // Get all supervisee IDs across all agencies
      const allSuperviseeIds = [];
      for (const agencyId of allAgencyIds) {
        const superviseeIds = await SupervisorAssignment.getSuperviseeIds(userId, agencyId);
        allSuperviseeIds.push(...superviseeIds);
      }

      // Get counts for all agencies, then filter by supervisee IDs
      const allCounts = await Notification.getCountsByAgency(allAgencyIds);
      
      // Filter counts to only include notifications for assigned supervisees
      const filteredCounts = {};
      for (const agencyId of allAgencyIds) {
        const notifications = await Notification.findByAgency(agencyId, {
          isRead: false,
          isResolved: false
        });
        const filteredNotifications = notifications.filter(n => 
          n.user_id && allSuperviseeIds.includes(n.user_id)
        );
        filteredCounts[agencyId] = filteredNotifications.length;
      }
      
      return res.json(filteredCounts);
    } else if (userRole === 'clinical_practice_assistant') {
      // CPAs can see all notification counts for all users in their agencies
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
    } else {
      // Admin/support can only see their agencies
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
    }

    if (agencyIds.length === 0) {
      return res.json({});
    }

    const counts = await Notification.getCountsByAgency(agencyIds);
    res.json(counts);
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    await Notification.markAsRead(id, userId);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

export const markAsResolved = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    await Notification.markAsResolved(id);
    res.json({ message: 'Notification marked as resolved' });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const { agencyId, filters } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Verify user has access to this agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    let count;
    if (filters && (filters.type || filters.userId || filters.relatedEntityType)) {
      // Mark filtered notifications as read
      const allNotifications = await Notification.findByAgency(parseInt(agencyId), {
        type: filters.type,
        isRead: false,
        isResolved: false
      });
      
      let filtered = allNotifications;
      if (filters.userId) {
        filtered = filtered.filter(n => n.user_id === parseInt(filters.userId));
      }
      if (filters.relatedEntityType && filters.relatedEntityId) {
        filtered = filtered.filter(n => 
          n.related_entity_type === filters.relatedEntityType && 
          n.related_entity_id === parseInt(filters.relatedEntityId)
        );
      }
      
      // Mark each filtered notification as read
      for (const notification of filtered) {
        await Notification.markAsRead(notification.id, userId);
      }
      count = filtered.length;
    } else {
      count = await Notification.markAllAsReadForAgency(parseInt(agencyId), userId);
    }
    
    res.json({ message: `${count} notifications marked as read (muted for 48 hours)` });
  } catch (error) {
    next(error);
  }
};

export const markAllAsResolved = async (req, res, next) => {
  try {
    const { agencyId, filters } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Verify user has access to this agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    let count;
    if (filters && (filters.type || filters.userId || filters.relatedEntityType)) {
      count = await Notification.markAllAsResolvedForFilter(parseInt(agencyId), filters);
    } else {
      count = await Notification.markAllAsResolvedForAgency(parseInt(agencyId));
    }
    
    res.json({ message: `${count} notifications marked as resolved` });
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: { message: 'Notification not found' } });
    }

    // Verify user has access to this notification's agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(notification.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    await Notification.delete(id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

export const getSupervisorNotifications = async (req, res, next) => {
  try {
    // Allow both supervisors and CPAs
    // Check if requesting user is a supervisor using boolean as source of truth
    const User = (await import('../models/User.model.js')).default;
    const requestingUser = await User.findById(req.user.id);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    
    if (!isSupervisor && req.user.role !== 'clinical_practice_assistant') {
      return res.status(403).json({ error: { message: 'Access denied. Supervisor or Clinical Practice Assistant role required.' } });
    }

    const { agencyId } = req.query;
    const supervisorUserId = req.user.id;

    try {
      const notifications = await NotificationService.getSupervisorNotifications(
        supervisorUserId,
        agencyId ? parseInt(agencyId) : null
      );

      res.json(notifications);
    } catch (serviceError) {
      console.error('Error in NotificationService.getSupervisorNotifications:', serviceError);
      // Return empty array instead of error if service fails
      res.json([]);
    }
  } catch (error) {
    console.error('Error in getSupervisorNotifications controller:', error);
    next(error);
  }
};

export const syncNotifications = async (req, res, next) => {
  try {
    // Only allow super_admin or admin to trigger sync
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const { agencyId } = req.query;

    if (agencyId) {
      // Sync specific agency
      const notifications = await NotificationService.generateNotificationsForAgency(parseInt(agencyId));
      res.json({ 
        message: `Generated ${notifications.length} notifications for agency ${agencyId}`,
        notifications: notifications.length
      });
    } else {
      // Sync all agencies
      const results = await NotificationService.syncNotifications();
      res.json({ 
        message: 'Notifications synced for all agencies',
        results 
      });
    }
  } catch (error) {
    next(error);
  }
};
