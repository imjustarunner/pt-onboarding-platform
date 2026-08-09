-- Migration 1157: Enable all tenant features on Demo Playground for QA / test accounts
-- Demo was created with essential_baseline profile and several modules off; flip to custom + all on.
-- Google SSO stays off so quick-login test accounts work without domain restrictions.

UPDATE agencies
SET
  feature_flags = JSON_SET(
    COALESCE(feature_flags, JSON_OBJECT()),
    '$.tenantFeatureProfileKey', 'custom',
    '$.shiftProgramsEnabled', true,
    '$.budgetManagementEnabled', true,
    '$.standardsLearningEnabled', true,
    '$.groupClassSessionsEnabled', true,
    '$.publicProviderFinderEnabled', true,
    '$.workspaceProvisioningEnabled', true,
    '$.submitEnabledForEmployeePortal', true,
    '$.returningGuardianAutoMatchEnabled', true,
    '$.percentOfChargePayEnabled', true,
    '$.smsAutoProvisionOnPrehire', true,
    '$.clinicalChartEnabled', true,
    '$.clinicalNoteSigningEnabled', true,
    '$.medicalClaimsEnabled', true,
    '$.claimMdEnabled', true,
    '$.presenceEnabled', true,
    '$.kudosEnabled', true,
    '$.bookClubEnabled', true,
    '$.gamesPlatformEnabled', true,
    '$.momentumListEnabled', true,
    '$.onboardingTrainingEnabled', true,
    '$.hiringEnabled', true,
    '$.payrollEnabled', true,
    '$.medicalBillingEnabled', true,
    '$.guardianWaiversEnabled', true,
    '$.aiProviderSearchEnabled', true,
    '$.trainingAiBuilderEnabled', true,
    '$.schoolPortalsEnabled', true,
    '$.skillBuildersSchoolProgramEnabled', true,
    '$.peopleOpsEnabled', true,
    '$.focusMusicEnabled', true,
    '$.focusPackageEnabled', true
  ),
  updated_at = NOW()
WHERE slug = 'demo'
  AND organization_type = 'agency';
