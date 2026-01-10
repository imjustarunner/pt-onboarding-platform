import pool from '../config/database.js';

export const requireAgencyAccess = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyId = req.params.agencyId || req.body.agencyId;

    if (!agencyId) {
      return next(); // No agency specified, allow
    }

    // Admins have access to all agencies
    if (req.user.role === 'admin') {
      req.agencyId = agencyId;
      return next();
    }

    // Check if user has access to this agency
    const [rows] = await pool.execute(
      'SELECT * FROM user_agencies WHERE user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: { message: 'Access denied to this agency' } });
    }

    req.agencyId = agencyId;
    next();
  } catch (error) {
    next(error);
  }
};

