import bcrypt from 'bcrypt';
import pool from '../config/database.js';

async function setTestPasswords() {
  try {
    console.log('Setting test passwords for accounts...\n');
    
    // Hash passwords
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const accountPasswordHash = await bcrypt.hash('account123', 10);
    
    // Update all admin accounts (role = 'admin') to password 'admin123'
    const [adminResult] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE role = 'admin'",
      [adminPasswordHash]
    );
    
    console.log(`✅ Updated ${adminResult.affectedRows} admin account(s) with password: admin123`);
    
    // Update all other accounts (not super_admin, not admin) to password 'account123'
    const [accountResult] = await pool.execute(
      "UPDATE users SET password_hash = ? WHERE role NOT IN ('super_admin', 'admin')",
      [accountPasswordHash]
    );
    
    console.log(`✅ Updated ${accountResult.affectedRows} other account(s) with password: account123`);
    
    // Show summary
    console.log('\n--- Summary ---\n');
    
    const [admins] = await pool.execute(
      "SELECT email, role FROM users WHERE role = 'admin' ORDER BY email"
    );
    
    if (admins.length > 0) {
      console.log('Admin accounts (password: admin123):');
      admins.forEach(user => {
        console.log(`  👤 ${user.email}`);
      });
    }
    
    const [others] = await pool.execute(
      "SELECT email, role FROM users WHERE role NOT IN ('super_admin', 'admin') ORDER BY email LIMIT 10"
    );
    
    if (others.length > 0) {
      console.log(`\nOther accounts (password: account123) - showing first 10:`);
      others.forEach(user => {
        console.log(`  👤 ${user.email} (${user.role})`);
      });
      const [totalOthers] = await pool.execute(
        "SELECT COUNT(*) as total FROM users WHERE role NOT IN ('super_admin', 'admin')"
      );
      if (totalOthers[0].total > 10) {
        console.log(`  ... and ${totalOthers[0].total - 10} more`);
      }
    }
    
    const [superAdmin] = await pool.execute(
      "SELECT email FROM users WHERE role = 'super_admin'"
    );
    
    if (superAdmin.length > 0) {
      console.log(`\nSuper admin account(s) (password unchanged):`);
      superAdmin.forEach(user => {
        console.log(`  🔑 ${user.email}`);
      });
    }
    
    console.log('\n✅ All passwords updated successfully!');
    
  } catch (error) {
    console.error('❌ Error setting test passwords:', error);
  } finally {
    process.exit(0);
  }
}

setTestPasswords();

