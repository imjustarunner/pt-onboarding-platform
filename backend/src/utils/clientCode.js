import pool from '../config/database.js';

/** Reserve a sequential public identifier without changing the database key. */
export async function generateUniqueSixDigitClientCode({ agencyId }, db = pool) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw new Error('agencyId is required to generate client code');
  const connection = await db.getConnection();
  try {
    await connection.execute("INSERT INTO client_identifier_sequences (sequence_key,last_value) VALUES ('client',99999) ON DUPLICATE KEY UPDATE sequence_key=VALUES(sequence_key)");
    for (let attempt=0; attempt<1000; attempt++) {
      const [result] = await connection.execute("UPDATE client_identifier_sequences SET last_value=LAST_INSERT_ID(last_value+1) WHERE sequence_key='client' AND last_value<999999");
      if (Number(result.affectedRows)!==1) throw new Error('All six-digit client numbers have been reserved.');
      const [[row]] = await connection.execute('SELECT LAST_INSERT_ID() AS client_number');
      const code = String(row.client_number).padStart(6,'0');
      const [existing] = await connection.execute('SELECT id FROM clients WHERE identifier_code=? LIMIT 1',[code]);
      if (!existing.length) return code;
    }
    throw new Error('Unable to reserve an unused client number.');
  } finally { connection.release(); }
}
