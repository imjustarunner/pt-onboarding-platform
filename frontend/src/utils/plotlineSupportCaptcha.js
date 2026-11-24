const loads = new Map();
export async function plotlineSupportCaptcha(siteKey, useEnterprise = false) {
  if (!siteKey) throw new Error('Human verification is temporarily unavailable. Please try again later.');
  const client = () => useEnterprise ? window.grecaptcha?.enterprise : window.grecaptcha;
  const key = `${useEnterprise}:${siteKey}`;
  if (!client()?.execute) {
    if (!loads.has(key)) loads.set(key, new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/${useEnterprise?'enterprise':'api'}.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {loads.delete(key);script.remove();reject(new Error('Human verification could not load. Please try again.'));};
      document.head.appendChild(script);
    }));
    await loads.get(key);
  }
  const api = client();
  if (!api?.execute) {loads.delete(key);throw new Error('Human verification could not load. Please try again.');}
  await new Promise(resolve => api.ready(resolve));
  return api.execute(siteKey,{action:'plotline_support'});
}
