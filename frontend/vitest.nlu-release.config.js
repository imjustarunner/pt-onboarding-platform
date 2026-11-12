import intake from './vitest.nlu-intake-repair.config.js';
import workspace from './vitest.nlu-workspace.config.js';
import childcare from './vitest.nlu-childcare.config.js';
export default { ...intake, root: new URL('.', import.meta.url).pathname, test: { ...intake.test, restoreMocks: true, include: [...new Set([...intake.test.include, ...workspace.test.include, ...childcare.test.include, 'src/components/__tests__/PoweredByFooter.nlu.test.js', 'src/utils/__tests__/serviceLegalContext.test.js', 'src/views/__tests__/CandidatePreHirePortal.account.test.js', 'src/components/messages/__tests__/MessagesHubShell.threading.test.js'])] } };
