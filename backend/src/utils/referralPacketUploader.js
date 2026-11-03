export async function referralPacketUploaderLabel({ uploaderId, currentUser = null, database }) {
  const id = Number(uploaderId || 0);
  if (!id) return 'Public upload';
  const hasCurrentName = Boolean(currentUser?.first_name || currentUser?.last_name);
  let uploader = Number(currentUser?.id) === id && hasCurrentName ? currentUser : null;
  if (!uploader) {
    const [rows] = await database.execute('SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1', [id]);
    uploader = rows?.[0];
  }
  return [uploader?.first_name, uploader?.last_name].filter(Boolean).join(' ').trim() || `User ${id}`;
}
