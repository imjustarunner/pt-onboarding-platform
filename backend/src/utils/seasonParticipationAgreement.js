import crypto from 'crypto';

const cleanText = (value) => String(value || '').trim();

export const normalizeParticipationAgreement = (input = {}) => {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const items = Array.isArray(src.items)
    ? src.items.map((item) => cleanText(item)).filter(Boolean)
    : [];
  return {
    label: cleanText(src.label),
    introText: cleanText(src.introText ?? src.introduction ?? src.description),
    items
  };
};

export const hasParticipationAgreement = (input = {}) => {
  const agreement = normalizeParticipationAgreement(input);
  return Boolean(agreement.label || agreement.introText || agreement.items.length);
};

export const buildParticipationAgreementHash = (input = {}) => {
  const normalized = normalizeParticipationAgreement(input);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
};
