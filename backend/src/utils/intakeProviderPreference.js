import {linkLooksLikeOfficeIntake} from './officeIntakeLink.js';
export function allowsProviderPreference(link) {
 const type=String(link?.form_type||link?.formType||'').toLowerCase();
 if(/quick|short|interest|registration|request/.test(type))return false;
 if(String(link?.scope_type||'').toLowerCase()==='school')return false;
 return linkLooksLikeOfficeIntake(link)||link?.master_channel==='tutoring';
}
export function stripIneligibleProviderPreference(link,intakeData) {
 if(allowsProviderPreference(link))return;
 const bag=intakeData?.responses?.submission;if(!bag)return;
 for(const key of ['preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','preferredProviderUserId','preferredProviderId','providerSelection','providerSelections','requested_profile_provider_id','enrollment_source'])delete bag[key];
}
// Brief interest forms never select a provider or reserve a time. Those requests
// belong to the full enrollment pathway and its server-side policy validation.
export function withoutQuickProviderSelection(payload={}) {
 const clean={...payload,preferences:{...payload.preferences}};
 for(const bag of [clean,clean.preferences])for(const key of ['preferredProviderUserId','preferredProviderId','providerId','preferred_office_provider_ids','preferred_office_provider_summary','requested_opening_preference','requestedOpening','requestedOpeningPreference','providerHoldToken','providerSelection','providerSelections','requested_profile_provider_id','enrollment_source'])delete bag[key];
 return clean;
}
