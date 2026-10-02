// Voice endpoints are unavailable until a voice provider is wired in.
export const isVoiceCallingConfigured = () => false;

// Dedicated staff texting has not launched. Do not advertise purchased/assigned
// numbers on public cards until that rollout is enabled, even if SMS settings exist.
export const isStaffTextingAvailable = () => false;
