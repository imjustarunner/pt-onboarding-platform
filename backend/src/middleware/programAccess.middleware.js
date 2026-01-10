import pool from '../config/database.js';

export const requireProgramAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const programId = req.params.programId || req.body.programId;

    if (!programId) {
      return next(); // No program specified, allow
    }

    // Check if user has access to this program
    const [rows] = await pool.execute(
      'SELECT * FROM user_programs WHERE user_id = ? AND program_id = ?',
      [userId, programId]
    );

    if (rows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied to this program' } });
    }

    req.programId = programId;
    next();
  } catch (error) {
    next(error);
  }
};

