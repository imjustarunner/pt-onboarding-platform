// Parse only machine-readable permanent delivery failures, never prose or subject lines.
export function parseGuardianDeliveryReport(payload) {
  const headers = new Map((payload?.headers || []).map(h => [String(h.name).toLowerCase(), h.value]));
  if (payload?.mimeType !== 'multipart/report' || !/report-type\s*=\s*"?delivery-status/i.test(headers.get('content-type') || '')) return [];
  let report = '', original = '';
  const walk = part => {
    const body = part.body?.data ? Buffer.from(part.body.data, 'base64url').toString('utf8') : '';
    if (part.mimeType === 'message/delivery-status') report += body;
    if (['message/rfc822','text/rfc822-headers'].includes(part.mimeType)) {
      original += body + '\n' + (part.headers || []).filter(h=>String(h.name).toLowerCase()==='message-id').map(h=>`${h.name}: ${h.value}`).join('\n');
      for (const child of part.parts || []) original += '\n' + (child.headers || []).filter(h=>String(h.name).toLowerCase()==='message-id').map(h=>`${h.name}: ${h.value}`).join('\n');
    }
    for (const child of part.parts || []) walk(child);
  };
  walk(payload);
  const messageId = report.match(/^Original-Message-ID:\s*(<[^<>\s]+@[^<>\s]+>)/im)?.[1] || original.match(/^Message-ID:\s*(<[^<>\s]+@[^<>\s]+>)/im)?.[1];
  if (!messageId) return [];
  return report.split(/\r?\n\s*\r?\n/).flatMap(block => {
    const recipient = block.match(/^Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/im)?.[1]?.toLowerCase();
    return recipient && /^Action:\s*failed\s*$/im.test(block) && /^Status:\s*5\./im.test(block) ? [{ messageId, recipient }] : [];
  });
}
