import pool from '../config/database.js';

class Certificate {
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM certificates WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC',
      [userId]
    );
    return rows;
  }

  static async findByEmail(email) {
    const [rows] = await pool.execute(
      'SELECT * FROM certificates WHERE email = ? ORDER BY issued_at DESC',
      [email]
    );
    return rows;
  }

  static async findByReference(certificateType, referenceId, userId = null) {
    let query = 'SELECT * FROM certificates WHERE certificate_type = ? AND reference_id = ?';
    const params = [certificateType, referenceId];
    
    if (userId !== null) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY issued_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows.length > 0 ? rows[0] : null;
  }

  static async create(data) {
    const {
      userId,
      email,
      certificateType,
      referenceId,
      certificateData,
      pdfPath,
      certificateNumber
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO certificates 
       (user_id, email, certificate_type, reference_id, certificate_data, pdf_path, certificate_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        email || null,
        certificateType,
        referenceId,
        certificateData ? JSON.stringify(certificateData) : null,
        pdfPath || null,
        certificateNumber || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async update(id, data) {
    const updates = [];
    const values = [];

    if (data.pdfPath !== undefined) {
      updates.push('pdf_path = ?');
      values.push(data.pdfPath);
    }
    if (data.certificateData !== undefined) {
      updates.push('certificate_data = ?');
      values.push(JSON.stringify(data.certificateData));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(
      `UPDATE certificates SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async generateCertificateNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CERT-${timestamp}-${random}`;
  }
}

export default Certificate;

