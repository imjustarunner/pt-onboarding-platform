import ChallengeSeasonParticipationAcceptance from '../models/ChallengeSeasonParticipationAcceptance.model.js';
import {
  hasParticipationAgreement,
  normalizeParticipationAgreement
} from './seasonParticipationAgreement.js';

const parseJsonObject = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

export const getChallengeParticipationAgreement = (klass) => {
  const settings = parseJsonObject(klass?.season_settings_json || {});
  return normalizeParticipationAgreement(settings.participationAgreement || settings.communityGuidelines || {});
};

export const requiresChallengeParticipationAgreement = (klass) => {
  return hasParticipationAgreement(getChallengeParticipationAgreement(klass));
};

export const ensureChallengeParticipationAgreementAccepted = async ({ klass, userId }) => {
  const agreement = getChallengeParticipationAgreement(klass);
  if (!hasParticipationAgreement(agreement)) return { ok: true, required: false, accepted: true, agreement };
  const accepted = await ChallengeSeasonParticipationAcceptance.findCurrent({
    classId: klass?.id,
    providerUserId: userId,
    agreement
  });
  if (accepted) {
    return { ok: true, required: true, accepted: true, agreement, acceptance: accepted };
  }
  return {
    ok: false,
    required: true,
    accepted: false,
    agreement,
    status: 428,
    message: 'Accept this season participation agreement before participating.'
  };
};
