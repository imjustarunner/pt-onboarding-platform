export function passkeyError(error) {
 if(['NotAllowedError','AbortError'].includes(error?.name)||['ERROR_CEREMONY_ABORTED','ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'].includes(error?.code))return 'Passkey sign-in was canceled or timed out. You can try again or use your usual sign-in.';
 if(error?.name==='InvalidStateError')return 'This device already has a passkey for this account. Use it to sign in, or choose another device.';
 return error?.response?.data?.error?.message || 'Your device could not complete the passkey request. Try another browser or your usual sign-in.';
}
