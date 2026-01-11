import pool from '../config/database.js';

async function checkUserCount() {
  try {
    const [results] = await pool.execute('SELECT COUNT(*) as total FROM users');
    const total = results[0].total;
    
    console.log(`\n📊 Total users in system: ${total}\n`);
    
    // Get breakdown by role
    const [roleBreakdown] = await pool.execute(`
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role 
      ORDER BY count DESC
    `);
    
    console.log('Breakdown by role:');
    roleBreakdown.forEach(row => {
      console.log(`  - ${row.role || '(no role)'}: ${row.count}`);
    });
    
    // Get breakdown by status
    const [statusBreakdown] = await pool.execute(`
      SELECT status, COUNT(*) as count 
      FROM users 
      GROUP BY status 
      ORDER BY count DESC
    `);
    
    console.log('\nBreakdown by status:');
    statusBreakdown.forEach(row => {
      console.log(`  - ${row.status || '(no status)'}: ${row.count}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking user count:', error);
    process.exit(1);
  }
}

checkUserCount();
