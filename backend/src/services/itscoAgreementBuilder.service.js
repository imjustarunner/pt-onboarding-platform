import { determineLicenseStatus, isBachelorsCredentialText } from '../utils/credentialNormalization.js';
import { hasSchoolServiceFocus } from './contractServiceFocus.service.js';

const VARIANTS = [
  { value: 'provider', label: 'Employment agreement — Provider', slug: 'itsco_licensed_ffs', roleLabel: 'Provider' },
  { value: 'facilitator', label: 'Employment agreement — Facilitator', slug: 'itsco_facilitator', roleLabel: 'Facilitator' },
  { value: 'student', label: 'Student training agreement', slug: 'itsco_intern_practicum', roleLabel: 'Student' }
];

export function inferItscoAgreementVariant(tokens = {}) {
  const role = `${tokens.ROLE_TYPE || ''} ${tokens.ROLE_LABEL || ''} ${tokens.JOB_TITLE || ''} ${tokens.CREDENTIAL || ''}`;
  if (/\b(?:intern|internship|practicum|student)\b/i.test(role)) return 'student';
  if (/facilitat|\bQBHA\b|\bpeer\b/i.test(role) || isBachelorsCredentialText(tokens.CREDENTIAL || tokens.LICENSE_TYPE)) return 'facilitator';
  return 'provider';
}

export function itscoAgreementBuilder({ agency, configs = [], tokens = {} }) {
  if (String(agency?.slug || '').toLowerCase() !== 'itsco') return null;
  return {
    suggestedVariant: inferItscoAgreementVariant(tokens),
    suggestedTrainingStartPhase: /practicum/i.test(`${tokens.ROLE_TYPE || ''} ${tokens.JOB_TITLE || ''}`) ? 'practicum' : 'internship',
    options: VARIANTS.map(variant => ({ ...variant, configId: configs.find(config => config.slug === variant.slug)?.id || null })),
    payMode: 'ffs'
  };
}

export function buildItscoAgreementPlan({ variant, config, tokens = {}, jobDescClauseKey }) {
  const definition = VARIANTS.find(item => item.value === variant);
  if (!definition || config.slug !== definition.slug) throw Object.assign(new Error('The agreement type and contract settings do not match. Refresh contract settings and select the agreement type again.'), { status: 400 });
  const baseKeys = typeof config.clause_keys_json === 'string' ? JSON.parse(config.clause_keys_json) : config.clause_keys_json;
  if (!Array.isArray(baseKeys) || !baseKeys.length) throw Object.assign(new Error('The standard contract clauses are not configured.'), { status: 400 });
  const trainingStartPhase = variant === 'student' ? String(tokens.TRAINING_START_PHASE || '').toLowerCase().trim() : null;
  if (variant === 'student' && !['practicum', 'internship'].includes(trainingStartPhase)) throw Object.assign(new Error('Choose whether the student starts in practicum or internship.'), { status: 400 });
  const customJobClause = /^JOB_DESC_JD_\d+$/i.test(jobDescClauseKey || '') ? jobDescClauseKey.toUpperCase() : null;
  const duties = customJobClause || (variant === 'student' ? 'JOB_DESC_INTERN' : variant === 'facilitator' ? 'JOB_DESC_FAC'
    : hasSchoolServiceFocus(tokens.SERVICE_FOCUS) ? 'JOB_DESC_LPC' : 'JOB_DESC_LPC_ALL');
  const licensure = variant === 'provider'
    ? String(tokens.LICENSURE_DEADLINE || '').trim() ? ['LICENSURE_CONT']
      : ['licensed', 'prelicensed'].includes(determineLicenseStatus({ credential: tokens.CREDENTIAL || tokens.LICENSE_TYPE, jobTitle: tokens.JOB_TITLE }).status) ? ['LICENSURE_STATUS'] : []
    : [];
  // Reuse the library's standard terms; derive only the clauses controlled by
  // agreement type, duties, credential conditions and current compensation.
  const standardKeys = baseKeys.filter(key => !/^(INTRO_|JOB_DESC_|LICENSURE_|COMP_|FFS_TABLE|FFS_INTERN_ADDITIONAL)/.test(key)
    && !['ASSIGNED_OFFICE', 'TERM_AT_WILL', 'TERM_STUDENT_TRAINING', 'SUP_COMP'].includes(key));
  const clauseKeys = [variant === 'student' ? 'INTRO_STUDENT_TRAINING' : 'INTRO_ITSCO',
    ...(variant === 'student' ? ['TERM_STUDENT_TRAINING'] : baseKeys.includes('TERM_AT_WILL') ? ['TERM_AT_WILL'] : []), 'ASSIGNED_OFFICE', ...licensure, duties,
    'COMP_CATEGORY_LEVEL', 'FFS_TABLE', ...standardKeys];
  return { variant, trainingStartPhase, name: definition.label, roleLabel: definition.roleLabel, payMode: 'ffs', clauseKeys: [...new Set(clauseKeys)] };
}
