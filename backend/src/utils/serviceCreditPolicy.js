// Keep executed historical agreements on their own recorded terms.
export const SERVICE_CREDIT_POLICY_VERSION = 'itsco-2026-10-service-credit-v3';
export const isServiceCreditPolicy = value => ['itsco-2026-10-service-credit-v2', SERVICE_CREDIT_POLICY_VERSION].includes(value);
export const defaultHcodeIndirectMinutes = category => [2, 3].includes(Number(category)) ? 10 : 0;
export const conditionalLevelBonus = level => ({3:2,4:1,5:3}[Number(level)] || 0);
