export function createVideoConnectAttempt({timeoutMs = 30000} = {}) {
  const controller = new AbortController();
  const canceled = () => Object.assign(new Error('Video connection canceled.'), {name:'AbortError'});
  function wait(start, phase, phaseTimeout = timeoutMs) {
    if (controller.signal.aborted) return Promise.reject(canceled());
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        controller.signal.removeEventListener('abort', abort);
        fn(value);
      };
      const abort = () => finish(reject, canceled());
      const timer = setTimeout(() => finish(reject, Object.assign(new Error(`${phase} did not finish. Check browser permissions and your connection, then choose Retry.`), {name:'VideoConnectionError',code:'VIDEO_CONNECTION_WAIT_EXPIRED',phase})), phaseTimeout);
      controller.signal.addEventListener('abort', abort, {once:true});
      try { Promise.resolve(start()).then(value => finish(resolve, value), error => finish(reject, error)); }
      catch (error) { finish(reject, error); }
    });
  }
  return {wait, cancel:() => controller.abort(), get canceled() { return controller.signal.aborted; }};
}
