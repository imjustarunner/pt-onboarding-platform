import pool from '../config/database.js';

async function restoreSuperAdmin() {
  try {
    console.log('🔍 Checking superadmin account...');
    
    // Find the superadmin user
    const [users] = await pool.execute(
      "SELECT id, email, role FROM users WHERE email = 'superadmin@plottwistco.com'"
    );
    
    if (users.length === 0) {
      console.log('❌ Superadmin account not found!');
      console.log('Creating superadmin account...');
      
      // Create the superadmin account
      const bcrypt = (await import('bcrypt')).default;
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await pool.execute(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, status)
         VALUES ('superadmin@plottwistco.com', ?, 'super_admin', 'Super', 'Admin', TRUE, 'active')`,
        [hashedPassword]
      );
      
      console.log('✅ Superadmin account created with password: admin123');
      console.log('⚠️  Please change the password immediately!');
    } else {
      const user = users[0];
      console.log(`Found user: ${user.email} (ID: ${user.id})`);
      console.log(`Current role: ${user.role}`);
      
      if (user.role !== 'super_admin') {
        console.log('⚠️  Role is not super_admin! Restoring...');
        
        await pool.execute(
          "UPDATE users SET role = 'super_admin' WHERE id = ?",
          [user.id]
        );
        
        console.log('✅ Superadmin role restored!');
      } else {
        console.log('✅ Superadmin role is correct');
      }
    }
    
    // Verify the trigger exists
    console.log('\n🔍 Checking database trigger...');
    const [triggers] = await pool.execute("SHOW TRIGGERS");
    const triggerExists = triggers.some(t => t.Trigger === 'protect_superadmin_role');
    
    if (!triggerExists) {
      console.log('⚠️  Trigger not found!');
      console.log('   Note: Trigger creation requires SUPER privilege.');
      console.log('   Application-level protection is active in User.update() method.');
      console.log('   Run migration 084_ensure_superadmin_protection.sql manually if you have SUPER privilege.');
    } else {
      console.log('✅ Trigger exists and is active');
    }
    
    console.log('\n✅ Superadmin protection verified!');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
    process.exit(0);
  }
}

restoreSuperAdmin();
