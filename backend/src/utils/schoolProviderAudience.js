// Uses the same current-school evidence for distribution membership and training visibility.
// The caller supplies users u and user_agencies ua aliases.
export const SCHOOL_PROVIDER_ASSIGNMENT_SQL = `EXISTS(SELECT 1 FROM agencies school WHERE school.organization_type='school' AND COALESCE(school.is_archived,0)=0
      AND (school.is_active=1 OR JSON_UNQUOTE(JSON_EXTRACT(school.feature_flags,'$.schoolOnboardingDraft'))='true')
      AND (EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.agency_id=ua.agency_id AND oa.organization_id=school.id AND oa.is_active=1)
        OR EXISTS(SELECT 1 FROM agency_schools ags WHERE ags.agency_id=ua.agency_id AND ags.school_organization_id=school.id AND ags.is_active=1))
      AND (EXISTS(SELECT 1 FROM user_agencies school_ua WHERE school_ua.user_id=u.id AND school_ua.agency_id=school.id AND school_ua.is_active=1)
        OR EXISTS(SELECT 1 FROM provider_school_assignments psa WHERE psa.provider_user_id=u.id AND psa.school_organization_id=school.id AND psa.is_active=1))
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','facilitator','clinician','qbha') OR u.has_provider_access=1)
    )`;
