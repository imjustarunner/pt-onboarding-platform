// Local browser regression check. Uses synthetic SDK media; no real meeting or credentials.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const sdk = `
const subscribers = new Map();
const handlers = {};
function media(target, name) {
  const element = document.createElement('div');
  element.className = 'OT_root';
  element.dataset.media = name;
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  element.append(video);
  target.append(element);
  return element;
}
const session = {
  connection: { connectionId: 'local' }, streams: {},
  on: (event, handler) => handlers[event] = handler,
  connect: (_token, callback) => queueMicrotask(callback),
  publish: (_publisher, callback) => queueMicrotask(callback),
  unpublish() {}, disconnect() {}, unsubscribe() {}, signal() {},
  subscribe(stream, target, options, callback) {
    const events = {};
    const sub = { element: media(target, stream.streamId), on: (event, handler) => events[event] = handler, subscribeToAudio() {}, events };
    subscribers.set(stream.streamId, sub);
    queueMicrotask(() => callback());
    return sub;
  }
};
window.meetingTest = {
  subscribers,
  add: (i) => handlers.streamCreated({ stream: { streamId: 'peer-' + i, name: 'Person ' + i, hasAudio: true, hasVideo: true, connection: { connectionId: 'conn-' + i } } }),
  speak: (i, level) => subscribers.get('peer-' + i).events.audioLevelUpdated({ audioLevel: level }),
  camera: (i, on) => handlers.streamPropertyChanged({ stream: { streamId: 'peer-' + i, connection: { connectionId: 'conn-' + i } }, changedProperty: 'hasVideo', newValue: on })
};
export default {
  initSession: () => session,
  hasMediaProcessorSupport: () => false,
  initPublisher(target, options, callback) {
    const pub = { element: media(target, 'local'), on() {}, publishAudio() {}, publishVideo() {}, destroy() {}, getAudioSource: () => ({ getSettings: () => ({}), applyConstraints: async () => {}, stop() {} }) };
    queueMicrotask(() => callback(options.videoSource === 'screen' && window.meetingTest.rejectScreen ? new Error('Permission denied') : undefined));
    return pub;
  }
};`;
const app = `
import { createApp, ref, h } from '/node_modules/.vite/deps/vue.js';
import { createPinia } from '/node_modules/.vite/deps/pinia.js';
import VideoSessionRoom from '/src/components/video/VideoSessionRoom.vue';
import MeetingAgendaPanel from '/src/components/meetings/MeetingAgendaPanel.vue';
const focus = ref('equal'); const fullscreen = ref(false);
window.layoutTest = { focus, fullscreen };
createApp({ setup: () => () => h('main', { style: 'height:700px;width:1100px;display:flex;gap:12px' }, [
  h('div', { style: 'width:800px;height:600px' }, [h(VideoSessionRoom, {
    applicationId: '11111111-1111-4111-8111-111111111111', sessionId: 'fake', token: 'eyJ.fake', localName: 'You',
    playJoinTone: false, allowTileFocus: true, tileFocus: focus.value, videoFullscreen: fullscreen.value,
    'onUpdate:tileFocus': value => focus.value = value, 'onUpdate:videoFullscreen': value => fullscreen.value = value
  })]),
  h('aside', { style: 'width:280px' }, [h(MeetingAgendaPanel, { meetingType: 'provider_schedule_event', meetingId: 1, liveSidebar: true, embedded: true, compact: true })])
]) }).use(createPinia()).mount('#app');`;

const server = await createServer({
  configFile: new URL('../vite.config.js', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
  plugins: [{ name: 'meeting-fixture', enforce: 'pre',
    resolveId(id) { if (id === '@vonage/client-sdk-video') return '\0meeting-sdk'; },
    load(id) { if (id === '\0meeting-sdk') return sdk; },
    configureServer(server) {
      server.middlewares.use('/meeting-check', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/meeting-check', '<html><body><div id="app"></div><script type="module">' + app + '</script></body></html>'));
      });
    }
  }]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/api/**', route => route.fulfill({ json: {
    agenda: { id: 1 }, items: [{ id: 1, title: 'Review upcoming meetings', status: 'pending', created_by_name: 'Taylor Example' }]
  } }));
  await page.goto('http://127.0.0.1:5187/meeting-check');
  await page.waitForFunction(() => window.meetingTest && !document.querySelector('.vsr__connecting'));
  for (let i = 0; i < 5; i++) {
    await page.evaluate(i => window.meetingTest.add(i), i);
    await page.waitForSelector('[data-media="peer-' + i + '"]');
  }
  const checkTiles = async () => {
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      const stage = document.querySelector('.vsr__stage').getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.vsr__stage > .vsr__tile')].filter(el => getComputedStyle(el).display !== 'none');
      return { count: tiles.length, fits: tiles.every(el => {
        const r = el.getBoundingClientRect();
        return r.height > 30 && r.width > 50 && r.bottom <= stage.bottom + 2 && r.right <= stage.right + 2;
      }), media: [...window.meetingTest.subscribers.values()].every(sub => sub.element.isConnected),
      fill: getComputedStyle(document.querySelector('.vsr__tile--remote video')).objectFit };
    });
    assert.equal(result.count, 6);
    assert.equal(result.fits, true, JSON.stringify(result));
    assert.equal(result.media, true);
    assert.equal(result.fill, 'cover');
  };
  await checkTiles();
  for (const focus of ['speaker', 'local', 'remote', 'equal']) {
    await page.evaluate(focus => window.layoutTest.focus.value = focus, focus);
    await checkTiles();
  }
  await page.evaluate(() => { window.layoutTest.focus.value = 'collapsed'; });
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.vsr__stage').evaluate(el => el.clientHeight <= 110));
  await page.getByTitle('Video layout').click();
  await page.getByRole('menuitem', { name: 'Full screen videos' }).click();
  await checkTiles();
  await page.setViewportSize({ width: 820, height: 1180 });
  await checkTiles();
  await page.evaluate(() => window.meetingTest.camera(2, false));
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.layoutTest.fullscreen.value = false; });
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => window.meetingTest.subscribers.get('peer-2').element.isConnected));
  await page.evaluate(() => window.meetingTest.camera(2, true));
  await checkTiles();
  await page.evaluate(() => window.layoutTest.focus.value = 'speaker');
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1100);
    await page.evaluate(i => window.meetingTest.speak(i, 0.07), i);
    await page.waitForTimeout(250);
    assert.ok(await page.locator('[data-media="peer-' + i + '"]').evaluate(el => el.closest('.vsr__tile').classList.contains('vsr__tile--featured')));
  }
  assert.ok(await page.getByText('Added by Taylor Example').isVisible());
  const agendaAligned = await page.locator('.agenda-item-row').evaluate(el => Math.abs(el.querySelector('.agenda-item-num').getBoundingClientRect().top - el.querySelector('.agenda-item-title').getBoundingClientRect().top) < 5);
  assert.equal(agendaAligned, true);
  const micHeight = await page.getByTitle('Mute microphone', { exact: true }).evaluate(el => el.getBoundingClientRect().height);
  const cameraHeight = await page.getByTitle('Turn camera off', { exact: true }).evaluate(el => el.getBoundingClientRect().height);
  assert.ok(Math.abs(micHeight - cameraHeight) < 2);
  await page.getByTitle('Share your screen', { exact: true }).click();
  await page.locator('.vsr__tile--screen video').waitFor({ state: 'visible' });
  assert.ok(await page.evaluate(() => [...window.meetingTest.subscribers.values()].every(sub => sub.element.isConnected)));
  await page.getByTitle('Stop sharing your screen', { exact: true }).click();
  await page.evaluate(() => window.meetingTest.rejectScreen = true);
  await page.getByTitle('Share your screen', { exact: true }).click();
  await page.getByText('Screen share was blocked.', { exact: false }).waitFor();
  assert.equal(await page.locator('.vsr__error').count(), 0);
  assert.ok(await page.evaluate(() => [...window.meetingTest.subscribers.values()].every(sub => sub.element.isConnected)));
  assert.deepEqual(errors, []);
  console.log('PASS: six-person layouts, full screen, collapse/restore, persistent media, five speakers, agenda author/alignment, matching controls, sharing preview/cancellation');
} finally {
  await browser?.close();
  await server.close();
}
