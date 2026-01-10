import pool from '../config/database.js';

async function fixAdminRoles() {
  try {
    console.log('Fixing admin roles in database...\n');
    
    // Fix superadmin@plottwistco.com
    const [superAdmin] = await pool.execute(
      'SELECT id, email, role FROM users WHERE email = ?',
      ['superadmin@plottwistco.com']
    );
    
    if (superAdmin.length > 0 && superAdmin[0].role !== 'super_admin') {
      await pool.execute(
        'UPDATE users SET role = ? WHERE email = ?',
        ['super_admin', 'superadmin@plottwistco.com']
      );
      console.log(`✅ Updated superadmin@plottwistco.com from ${superAdmin[0].role} to super_admin`);
    } else if (superAdmin.length > 0) {
      console.log(`✅ superadmin@plottwistco.com already has super_admin role`);
    } else {
      console.log(`⚠️  superadmin@plottwistco.com not found in database`);
    }
    
    // Fix admin@company.com
    const [admin] = await pool.execute(
      'SELECT id, email, role FROM users WHERE email = ?',
      ['admin@company.com']
    );
    
    if (admin.length > 0 && admin[0].role !== 'admin') {
      await pool.execute(
        'UPDATE users SET role = ? WHERE email = ?',
        ['admin', 'admin@company.com']
      );
      console.log(`✅ Updated admin@company.com from ${admin[0].role} to admin`);
    } else if (admin.length > 0) {
      console.log(`✅ admin@company.com already has admin role`);
    } else {
      console.log(`⚠️  admin@company.com not found in database`);
    }
    
    console.log('\n--- Verification ---\n');
    const [allAdmins] = await pool.execute(
      "SELECT email, role FROM users WHERE email IN ('superadmin@plottwistco.com', 'admin@company.com') OR role IN ('admin', 'super_admin') ORDER BY role = 'super_admin' DESC, email"
    );
    
    allAdmins.forEach(user => {
      const icon = user.role === 'super_admin' ? '🔑' : user.role === 'admin' ? '👤' : '⚠️';
      console.log(`  ${icon} ${user.email} - ${user.role}`);
    });
    
  } catch (error) {
    console.error('❌ Error fixing admin roles:', error);
  } finally {
    process.exit(0);
  }
}

fixAdminRoles();

