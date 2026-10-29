import pool from '../config/database.js';
import { assertAccountEnabled } from '../utils/accountAccess.js';

// Always read storage: neither an existing JWT nor a reset link proves that an
// administrator still permits access. Password setup must not re-enable a
// disabled account.
export async function assertCurrentAccountEnabled(userId, db = pool) {
  const [[user]] = await db.execute('SELECT status, is_active, is_archived FROM users WHERE id = ? LIMIT 1', [userId]);
  assertAccountEnabled(user);
}
