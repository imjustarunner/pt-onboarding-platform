import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import User from '../models/User.model.js';

async function testDocumentTasks() {
  try {
    console.log('🔍 Testing document task creation and retrieval...\n');
    
    // Get a test user
    const [users] = await pool.execute('SELECT id, email, first_name, last_name FROM users LIMIT 5');
    console.log('📋 Found users:', users.map(u => ({ id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}` })));
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }
    
    const testUserId = users[0].id;
    console.log(`\n👤 Using test user ID: ${testUserId}\n`);
    
    // Check existing document tasks for this user
    console.log('📄 Checking existing document tasks...');
    const existingTasks = await Task.getAll({
      taskType: 'document',
      assignedToUserId: testUserId
    });
    console.log(`Found ${existingTasks.length} existing document tasks for user ${testUserId}`);
    if (existingTasks.length > 0) {
      console.log('Existing tasks:');
      existingTasks.forEach(t => {
        console.log(`  - ID: ${t.id}, Title: ${t.title}, Status: ${t.status}, Assigned to User: ${t.assigned_to_user_id}, Agency: ${t.assigned_to_agency_id}`);
      });
    }
    
    // Check all document tasks in database
    console.log('\n📊 Checking all document tasks in database...');
    const [allTasks] = await pool.execute(
      "SELECT id, task_type, title, assigned_to_user_id, assigned_to_agency_id, status, created_at FROM tasks WHERE task_type = 'document' ORDER BY created_at DESC LIMIT 10"
    );
    console.log(`Found ${allTasks.length} total document tasks in database`);
    if (allTasks.length > 0) {
      console.log('Recent document tasks:');
      allTasks.forEach(t => {
        console.log(`  - ID: ${t.id}, Title: ${t.title}, User: ${t.assigned_to_user_id}, Agency: ${t.assigned_to_agency_id}, Status: ${t.status}`);
      });
    }
    
    // Test creating a task
    console.log('\n🧪 Testing task creation...');
    const testTask = await Task.create({
      taskType: 'document',
      documentActionType: 'signature',
      title: 'Test Document Task',
      description: 'This is a test task',
      assignedToUserId: testUserId,
      assignedToAgencyId: null,
      assignedByUserId: testUserId,
      referenceId: 1
    });
    console.log(`✅ Created test task: ID ${testTask.id}`);
    
    // Immediately query for it
    console.log('\n🔍 Querying for the newly created task...');
    const foundTasks = await Task.getAll({
      taskType: 'document',
      assignedToUserId: testUserId
    });
    console.log(`Found ${foundTasks.length} document tasks for user ${testUserId} after creation`);
    const foundTask = foundTasks.find(t => t.id === testTask.id);
    if (foundTask) {
      console.log('✅ Successfully found the newly created task!');
      console.log(`   Task ID: ${foundTask.id}, Title: ${foundTask.title}`);
    } else {
      console.log('❌ Could not find the newly created task!');
      console.log('   This suggests a query issue.');
    }
    
    // Clean up test task
    console.log('\n🧹 Cleaning up test task...');
    await pool.execute('DELETE FROM tasks WHERE id = ?', [testTask.id]);
    console.log('✅ Test task deleted');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testDocumentTasks();

