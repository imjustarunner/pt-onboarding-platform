// Existing SMS-enabled polls supported both channels before delivery choices existed.
export function pollDeliveryMode(config = {}) {
  return ['internal', 'sms', 'both'].includes(config.deliveryMode)
    ? config.deliveryMode : config.viaSms ? 'both' : 'internal';
}
export const pollUsesInternal = config => pollDeliveryMode(config) !== 'sms';
export const pollUsesSms = config => pollDeliveryMode(config) !== 'internal';
