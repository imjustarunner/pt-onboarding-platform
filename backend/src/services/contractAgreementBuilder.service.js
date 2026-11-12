import { itscoAgreementBuilder } from './itscoAgreementBuilder.service.js';
import { handbookTenant } from './handbookTenant.js';

export function contractAgreementBuilder({ agency, configs = [], tokens = {} }) {
  const itsco = itscoAgreementBuilder({ agency, configs, tokens });
  if (itsco) return { ...itsco, compensationBasis: 'category_service' };
  const tenant = handbookTenant(agency);
  if (!['nlu', 'isi'].includes(tenant)) return null;
  // Both starter presets hold employment terms. Pay comes from the approved
  // service schedule, not the historical hourly/FFS label on the preset.
  const standard = configs.filter(c => /^plotline_starter_v1_(hourly|ffs)$/.test(c.slug || ''));
  const config = standard.find(c => Number(c.is_active) === 1 && Number(c.id) === Number(tokens.DEFAULT_CONFIG_ID))
    || standard.find(c => Number(c.is_active) === 1)
    || standard.find(c => c.pay_mode === 'hourly') || standard[0];
  return {
    suggestedVariant: 'employment',
    compensationBasis: tenant === 'isi' ? 'individual_agreement' : 'category_service',
    description: tenant === 'isi'
      ? 'Use this person’s approved individual agreement and service-specific terms. There is no shared rate matrix.'
      : 'Choose the approved category and level, then review each assigned service and its pay rules. Eligible H-code direct care adds the configured indirect allowance; tutoring, childcare and testing use their own approved schedules.',
    options: [{ value: 'employment', label: 'Employment agreement', configId: config?.id || null,
      roleLabel: tokens.ROLE_LABEL || 'Employee', requiresApproval: config ? Number(config.is_active) !== 1 : true }]
  };
}
