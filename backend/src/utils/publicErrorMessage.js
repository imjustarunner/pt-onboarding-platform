const technical = /unknown column|sqlstate|ER_[A-Z_]+|sql syntax|\bSELECT\b.+\bFROM\b|\bINSERT INTO\b|\bat \S+\.(?:js|ts):\d+|field list|foreign key constraint/i;

/** Keep database and stack details in server logs, never in user-facing errors. */
export function publicErrorMessage(error, fallback = 'We could not complete this request. Please try again. If it continues, contact support.') {
  const message = String(error?.message || '');
  if (!message || technical.test(message) || error?.sqlMessage || /^ER_/.test(String(error?.code || ''))) return fallback;
  return message;
}
