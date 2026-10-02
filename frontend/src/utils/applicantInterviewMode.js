import { readonly, ref } from 'vue';

// Tab-local presentation only. Staff auth/locks remain unchanged, and every
// applicant API request still validates the opaque invitation on the server.
const active = ref(false);
export const applicantInterviewMode = readonly(active);
export function setApplicantInterviewMode(value) { active.value = value === true; }
