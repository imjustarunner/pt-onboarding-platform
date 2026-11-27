import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node', pool: 'threads', maxWorkers: 1,
    include: [
      'backend/src/routes/__tests__/vonageMount.test.js',
      'backend/src/services/__tests__/hire.interviewSms.test.js',
      'backend/src/services/__tests__/hire.platformInterviewSms.test.js',
      'backend/src/services/__tests__/messaging.compliance.test.js',
      'backend/src/services/__tests__/plotlineSenderProvisioning.test.js',
      'backend/src/services/__tests__/plotlineSenderProvisioning.mysql.test.js'
    ]
  }
};
