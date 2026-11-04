// This automatic family assignment template was withdrawn. Provider-authored
// contact-plan updates and appointment cancellation/reminder rules are separate.
export const retiredSchoolFamilyStatusTemplate=type=>String(type || '').trim().toLowerCase().replace(/^trigger:/,'')==='school_family_status_update';
export function assertSchoolStatusEmailAudience({templateType,triggerKey}={}) {
 if(retiredSchoolFamilyStatusTemplate(templateType)||retiredSchoolFamilyStatusTemplate(triggerKey))throw Object.assign(new Error('Assignment and waitlist notices go to the school and provider. Automatic family assignment notices are disabled.'),{status:403,code:'SCHOOL_FAMILY_ASSIGNMENT_NOTICES_RETIRED'});
}
