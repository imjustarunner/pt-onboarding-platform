// Browser-managed cloud recognition is outside the application's approved Cloud
// Speech project. Only use this API when the browser enforces on-device processing.
export function privateSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  const Native = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Native || !('processLocally' in Native.prototype)) return null;
  return class extends Native {
    constructor(...args) {
      super(...args);
      this.processLocally = true;
      if (this.processLocally !== true) throw new Error('On-device speech recognition is unavailable.');
    }
    start(...args) {
      this.processLocally = true;
      if (this.processLocally !== true) throw new Error('On-device speech recognition is unavailable.');
      return super.start(...args);
    }
  };
}
