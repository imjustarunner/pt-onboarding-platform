import { expect, it } from 'vitest';

it('loads the SMS route and media upload middleware without replacing the controller', async () => {
  const { default: router } = await import('../message.routes.js');
  expect(typeof router).toBe('function');
  const upload = router.stack.find(layer => layer.route?.path === '/upload-media');
  expect(upload?.route?.methods?.post).toBe(true);
});
