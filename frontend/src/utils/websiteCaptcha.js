let scriptPromise;
export async function websiteCaptchaToken(siteKey, action, required = true) {
 if (!siteKey) { if(required)throw new Error('Human verification is temporarily unavailable. Please try again.');return ''; }
 if (!window.grecaptcha?.execute) {
  if (!scriptPromise) scriptPromise = new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;script.async=true;
   script.onload=resolve;script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('Human verification could not load. Please try again.'));};document.head.appendChild(script);
  });
  await scriptPromise;
 }
 await new Promise(resolve=>window.grecaptcha.ready(resolve));
 return window.grecaptcha.execute(siteKey,{action});
}
