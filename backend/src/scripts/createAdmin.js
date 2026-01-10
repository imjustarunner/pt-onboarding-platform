import bcrypt from 'bcrypt';
import pool from '../config/database.js';

async function createAdmin() {
  try {
    const email = 'admin@company.com';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    await pool.execute(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, 'admin', 'Admin', 'User']
    );

    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@company.com');
    console.log('Password: admin123');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdmin();

