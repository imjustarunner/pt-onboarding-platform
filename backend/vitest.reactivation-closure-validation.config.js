import closure from './vitest.enrollment-termination.config.js';
export default {...closure,resolve:{alias:{vitest:new URL('../frontend/node_modules/vitest/dist/index.js',import.meta.url).pathname}}};
