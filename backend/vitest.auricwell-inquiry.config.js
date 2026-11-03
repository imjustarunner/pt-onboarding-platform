export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    env: { SKIP_DB_CONNECT: '1' },
    include: ['src/services/__tests__/auricwellInquiry.test.js', 'src/services/__tests__/ptcoInquiry.test.js']
  }
};
