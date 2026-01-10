import pool from '../config/database.js';

async function checkOverdueTasks() {
  try {
    console.log('Checking overdue tasks and their agency associations...\n');
    
    const [tasks] = await pool.execute(
      `SELECT t.id, t.title, t.due_date, t.assigned_to_user_id,
              u.first_name, u.last_name, u.email,
              GROUP_CONCAT(DISTINCT ua.agency_id) as agency_ids
       FROM tasks t
       INNER JOIN users u ON t.assigned_to_user_id = u.id
       LEFT JOIN user_agencies ua ON u.id = ua.user_id
       WHERE t.due_date IS NOT NULL
       AND t.due_date < NOW()
       AND t.status NOT IN ('completed', 'overridden')
       GROUP BY t.id, t.title, t.due_date, t.assigned_to_user_id, u.first_name, u.last_name, u.email
       LIMIT 20`
    );
    
    console.log(`Found ${tasks.length} overdue tasks (showing first 20):\n`);
    tasks.forEach((task, index) => {
      console.log(`${index + 1}. Task: "${task.title}"`);
      console.log(`   User: ${task.first_name} ${task.last_name} (${task.email})`);
      console.log(`   Due Date: ${new Date(task.due_date).toLocaleString()}`);
      console.log(`   Agency IDs: ${task.agency_ids || 'NONE - User not assigned to any agency!'}`);
      console.log('');
    });
    
    // Count tasks with and without agencies
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT t.id) as total_overdue,
        COUNT(DISTINCT CASE WHEN ua.agency_id IS NOT NULL THEN t.id END) as with_agencies,
        COUNT(DISTINCT CASE WHEN ua.agency_id IS NULL THEN t.id END) as without_agencies
       FROM tasks t
       INNER JOIN users u ON t.assigned_to_user_id = u.id
       LEFT JOIN user_agencies ua ON u.id = ua.user_id
       WHERE t.due_date IS NOT NULL
       AND t.due_date < NOW()
       AND t.status NOT IN ('completed', 'overridden')`
    );
    
    console.log('\nStatistics:');
    console.log(`  Total overdue tasks: ${stats[0].total_overdue}`);
    console.log(`  Tasks with agency associations: ${stats[0].with_agencies}`);
    console.log(`  Tasks without agency associations: ${stats[0].without_agencies}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkOverdueTasks();
