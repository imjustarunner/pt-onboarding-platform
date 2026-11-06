import logo from '../assets/narriva/logo-navy.png';
import icon from '../assets/narriva/icon-navy.png';
import compliance from '../assets/narriva/compliance.png';
import verified from '../assets/narriva/verified.png';
import notVerified from '../assets/narriva/not-verified.png';
import quickSign from '../assets/narriva/quick-sign.png';
import generate from '../assets/narriva/generate.png';
import smartNotes from '../assets/narriva/smart-notes.png';

export const NARRIVA_BRAND = Object.freeze({ logo, icon, compliance, verified, notVerified, quickSign, generate, smartNotes });
export const NARRIVA_MODES = Object.freeze([
  { id: 'manual', label: 'Manual writer', detail: 'Write and edit the note yourself.' },
  { id: 'narriva', label: 'Narriva', detail: 'Turn your Session Narrative into a structured note.' },
  { id: 'smart_notes', label: 'Smart Notes', detail: 'Build your note with guided clinical prompts.' }
]);
export const NARRIVA_CHECKS = Object.freeze([
  { id: 'risk_safety', label: 'Risk & Safety' },
  { id: 'service_code', label: 'Service Code & Documentation' },
  { id: 'encounter_consent', label: 'Encounter Details & Consent' },
  { id: 'necessity_interventions', label: 'Clinical Necessity & Interventions' },
  { id: 'participation_plan', label: 'Participation, Progress & Plan' }
]);
