import ReferralOcrService from './referralOcr.service.js';
export function parseInsuranceCardText(rawText = '') {
  const text = String(rawText || '').replace(/\r/g, '\n');
  const compact = text.replace(/\s+/g, ' ').trim();
  const insurerPatterns = [
    { label: 'Health First Colorado (Medicaid)', re: /(health\s*first\s*colorado|colorado\s+access|ccha|community\s+health\s+alliance|medicaid|chp\+)/i },
    { label: 'United Healthcare', re: /united\s*health\s*care|uhc/i },
    { label: 'Anthem Blue Cross Blue Shield of Colorado', re: /(anthem|blue\s*cross|blue\s*shield|bcbs)/i },
    { label: 'Aetna', re: /\baetna\b/i },
    { label: 'Cigna', re: /\bcigna\b/i },
    { label: 'Kaiser Permanente', re: /kaiser/i },
    { label: 'Humana', re: /humana/i },
    { label: 'Molina Healthcare of Colorado', re: /molina/i },
    { label: 'TRICARE', re: /tricare/i },
    { label: 'Medicare (Original)', re: /medicare/i }
  ];

  const memberMatch = text.match(/(?:^|\n)\s*(?:member\s*(?:id|number|#)|subscriber\s*(?:id|number|#)|id)\s*[:#]?\s*([A-Z0-9-]{3,})/i);
  const groupMatch = text.match(/(?:^|\n)\s*group(?:\s*(?:number|no|#|id))?\s*[:#]?\s*([A-Z0-9-]{3,})/i);
  const subscriberMatch = text.match(/(?:^|\n)\s*(?:subscriber name|member name|name)\s*[:#]\s*([^\n\r]{2,120})/i);

  let insurerName = '';
  for (const candidate of insurerPatterns) {
    if (candidate.re.test(compact)) {
      insurerName = candidate.label;
      break;
    }
  }

  return {
    insurerName,
    memberId: memberMatch?.[1] ? String(memberMatch[1]).trim() : '',
    groupNumber: groupMatch?.[1] ? String(groupMatch[1]).trim() : '',
    subscriberName: subscriberMatch?.[1]
      ? String(subscriberMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 120)
      : ''
  };
}

export async function extractInsuranceCardFieldsBestEffort(file) {
  if (!file?.buffer) return null;
  try {
    const text = await ReferralOcrService.extractText({
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/jpeg'
    });
    if (!String(text || '').trim()) return null;
    return parseInsuranceCardText(text);
  } catch {
    return null;
  }
}
