export const CHALLENGE_PROOF_POLICY_OPTIONS = [
  { value: 'none', label: 'No proof required', shortLabel: 'No proof' },
  { value: 'photo_required', label: 'Photo required', shortLabel: 'Photo required' },
  { value: 'gps_or_photo', label: 'GPS or photo proof', shortLabel: 'GPS or photo' },
  { value: 'gps_required_no_treadmill', label: 'GPS required (no treadmill)', shortLabel: 'GPS only' },
  { value: 'screenshot', label: 'Screenshot required', shortLabel: 'Screenshot' },
  { value: 'manager_approval', label: 'Manager approval', shortLabel: 'Manager approval' }
];

export function challengeProofPolicyLabel(policy, { short = false } = {}) {
  const normalized = String(policy || 'none').toLowerCase();
  const found = CHALLENGE_PROOF_POLICY_OPTIONS.find((option) => option.value === normalized);
  if (found) return short ? (found.shortLabel || found.label) : found.label;
  return short ? 'No proof' : 'No proof required';
}
