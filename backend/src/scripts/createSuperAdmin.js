import bcrypt from 'bcrypt';
import pool from '../config/database.js';

async function createSuperAdmin() {
  try {
    const email = 'superadmin@plottwistco.com';
    const password = 'superadmin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.execute(
      'SELECT id, role FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.role === 'super_admin') {
        console.log('Super admin user already exists with correct role');
        return;
      } else {
        // Update existing user to super_admin
        await pool.execute(
          'UPDATE users SET role = ?, password_hash = ?, first_name = ?, last_name = ? WHERE id = ?',
          ['super_admin', passwordHash, 'Super', 'Admin', existingUser.id]
        );
        console.log('✅ Super admin user updated successfully!');
        console.log('Email: superadmin@plottwistco.com');
        console.log('Password: superadmin123');
        return;
      }
    }

    await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, 'super_admin', 'Super', 'Admin']
    );

    console.log('✅ Super admin user created successfully!');
    console.log('Email: superadmin@plottwistco.com');
    console.log('Password: superadmin123');
  } catch (error) {
    console.error('❌ Error creating super admin user:', error);
  } finally {
    process.exit(0);
  }
}

createSuperAdmin();

