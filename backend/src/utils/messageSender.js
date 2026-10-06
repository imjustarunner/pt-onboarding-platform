/** Sender metadata belongs to the displayed message, not the thread's first participant. */
export function messageSender(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const sender = Array.isArray(value) ? value[0] : value;
    if (!sender || typeof sender !== 'object') return null;
    const email = String(sender.email || sender.address || '').trim();
    const name = String(sender.name || sender.displayName || email).trim();
    return name || email ? { name: name || email, email: email || null } : null;
  } catch { return null; }
}
