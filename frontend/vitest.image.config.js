import base from './vitest.release-recovery.config.js';
// The full repository gate also tests outcome scoring against backend source.
// The frontend Docker context contains frontend source only.
export default {...base,test:{...base.test,include:base.test.include.filter(path=>!path.endsWith('/OutcomeMeasures.test.js'))}};
