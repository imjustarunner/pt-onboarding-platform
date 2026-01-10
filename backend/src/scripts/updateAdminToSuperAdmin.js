import pool from '../config/database.js';

async function updateAdminToSuperAdmin() {
  try {
    // Update admin user to super_admin
    const [result] = await pool.execute(
      "UPDATE users SET role = 'super_admin' WHERE email = 'admin@company.com' AND role = 'admin'"
    );

    if (result.affectedRows > 0) {
      console.log('✅ Admin user updated to super_admin');
    } else {
      console.log('ℹ️  Admin user not found or already updated');
    }
  } catch (error) {
    console.error('❌ Error updating admin user:', error);
  } finally {
    process.exit(0);
  }
}

updateAdminToSuperAdmin();

