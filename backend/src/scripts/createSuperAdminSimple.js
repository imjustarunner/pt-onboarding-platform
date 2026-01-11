import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

async function createSuperAdmin() {
  // Create a simple connection (not a pool) for the script
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT) || 3307,
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'onboarding_stage',
    connectTimeout: 30000
  });

  try {
    const email = 'superadmin@plottwistco.com';
    // Get password from environment variable or prompt user
    const password = process.env.SUPERADMIN_PASSWORD || process.argv[2];
    if (!password) {
      console.error('❌ Error: Password required. Set SUPERADMIN_PASSWORD environment variable or pass as argument.');
      console.error('Usage: SUPERADMIN_PASSWORD=yourpassword node createSuperAdminSimple.js');
      console.error('   or: node createSuperAdminSimple.js yourpassword');
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await connection.execute(
      'SELECT id, role FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.role === 'super_admin') {
        // Update password hash
        await connection.execute(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [passwordHash, existingUser.id]
        );
        console.log('✅ Super admin user password updated successfully!');
        console.log('Email: superadmin@plottwistco.com');
        console.log('Password: superadmin123');
      } else {
        // Update existing user to super_admin
        await connection.execute(
          'UPDATE users SET role = ?, password_hash = ?, first_name = ?, last_name = ? WHERE id = ?',
          ['super_admin', passwordHash, 'Super', 'Admin', existingUser.id]
        );
        console.log('✅ Super admin user updated successfully!');
        console.log('Email: superadmin@plottwistco.com');
        console.log('Password: [REDACTED]');
      }
    } else {
      await connection.execute(
        'INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [email, passwordHash, 'super_admin', 'Super', 'Admin', 1, 'active']
      );
      console.log('✅ Super admin user created successfully!');
      console.log('Email: superadmin@plottwistco.com');
      console.log('Password: [REDACTED]');
    }
  } catch (error) {
    console.error('❌ Error creating super admin user:', error);
    throw error;
  } finally {
    await connection.end();
    process.exit(0);
  }
}

createSuperAdmin();
