import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';

async function testNotificationCreation() {
  try {
    const agencyId = 14;
    
    // Get one overdue task
    const [tasks] = await pool.execute(
      `SELECT DISTINCT t.id, t.title, t.due_date, t.assigned_to_user_id,
              u.first_name, u.last_name, u.email, ua.agency_id
       FROM tasks t
       INNER JOIN users u ON t.assigned_to_user_id = u.id
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND t.due_date IS NOT NULL
       AND t.due_date < NOW()
       AND t.status NOT IN ('completed', 'overridden')
       LIMIT 1`,
      [agencyId]
    );
    
    if (tasks.length === 0) {
      console.log('No overdue tasks found for agency', agencyId);
      return;
    }
    
    const task = tasks[0];
    console.log('Testing with task:', task.title);
    console.log('Task ID:', task.id);
    console.log('Agency ID:', agencyId);
    console.log('User:', task.first_name, task.last_name);
    
    // Check for existing notifications
    const existing = await Notification.findByAgency(agencyId, {
      type: 'task_overdue',
      isResolved: false
    });
    
    console.log('\nExisting notifications for this agency:', existing.length);
    const alreadyNotified = existing.some(n => 
      n.related_entity_type === 'task' && n.related_entity_id === task.id
    );
    
    console.log('Already notified for this task:', alreadyNotified);
    
    if (!alreadyNotified) {
      console.log('\nCreating notification...');
      const dueDate = new Date(task.due_date);
      
      const notification = await Notification.create({
        type: 'task_overdue',
        severity: 'warning',
        title: `Task Overdue`,
        message: `Task '${task.title}' for user ${task.first_name} ${task.last_name} is overdue. Due date: ${dueDate.toLocaleDateString()}.`,
        userId: task.assigned_to_user_id,
        agencyId: agencyId,
        relatedEntityType: 'task',
        relatedEntityId: task.id
      });
      
      console.log('✅ Notification created:', notification.id);
    } else {
      console.log('\nNotification already exists, skipping creation');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

testNotificationCreation();
