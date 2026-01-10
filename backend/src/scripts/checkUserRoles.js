import pool from '../config/database.js';

async function checkUserRoles() {
  try {
    console.log('Checking user roles in database...\n');
    
    // Get all users with admin or super_admin roles
    const [admins] = await pool.execute(
      "SELECT id, email, role, first_name, last_name, is_active FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role = 'super_admin' DESC, email"
    );
    
    if (admins.length === 0) {
      console.log('❌ No admin or super_admin users found in database');
      console.log('\nTo create a super admin, run: npm run create-super-admin');
      return;
    }
    
    console.log(`Found ${admins.length} admin/super_admin user(s):\n`);
    admins.forEach(user => {
      const status = user.is_active ? '✅ Active' : '❌ Inactive';
      console.log(`  ${user.role === 'super_admin' ? '🔑' : '👤'} ${user.email} (${user.role}) - ${user.first_name} ${user.last_name} [${status}]`);
    });
    
    // Check for common issues
    console.log('\n--- Checking for common issues ---\n');
    
    const [allUsers] = await pool.execute(
      "SELECT email, role FROM users WHERE email LIKE '%admin%' OR email LIKE '%super%' ORDER BY email"
    );
    
    if (allUsers.length > 0) {
      console.log('Users with "admin" or "super" in email:');
      allUsers.forEach(user => {
        const isCorrect = (user.email.includes('admin') || user.email.includes('super')) && 
                         (user.role === 'admin' || user.role === 'super_admin');
        console.log(`  ${isCorrect ? '✅' : '⚠️ '} ${user.email} - Current role: ${user.role}`);
        if (!isCorrect && (user.email.includes('superadmin') || user.email.includes('super_admin'))) {
          console.log(`     ⚠️  This user might need role updated to 'super_admin'`);
        }
      });
    }
    
    // Check enum values
    const [enumInfo] = await pool.execute(
      "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
    );
    
    if (enumInfo.length > 0) {
      console.log(`\n--- Role enum values ---`);
      console.log(`  ${enumInfo[0].COLUMN_TYPE}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking user roles:', error);
  } finally {
    process.exit(0);
  }
}

checkUserRoles();

