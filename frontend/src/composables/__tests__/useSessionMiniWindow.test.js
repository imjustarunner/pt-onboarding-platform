import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, Teleport } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useSessionMiniWindow } from '../useSessionMiniWindow.js';

let wrapper;
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.unstubAllGlobals(); document.body.innerHTML = ''; });

function popup() {
  const events = new EventTarget();
  const opened = { document: document.implementation.createHTMLDocument(), closed: false, addEventListener: events.addEventListener.bind(events) };
  opened.close = vi.fn(() => { opened.closed = true; events.dispatchEvent(new Event('pagehide')); });
  return opened;
}

function fixture(requestWindow) {
  vi.stubGlobal('documentPictureInPicture', { requestWindow });
  let state;
  const Harness = defineComponent({ setup() {
    state = useSessionMiniWindow();
    return () => h(Teleport, { to: state.miniTarget.value || 'body', disabled: !state.mini.value }, [h('div', { class: 'session' }, 'Connected session')]);
  } });
  wrapper = mount(Harness, { attachTo: document.body });
  return state;
}

it('restores the same session DOM when the PiP window closes and removes the old target', async () => {
  const opened = popup();
  const state = fixture(vi.fn(async () => opened));
  const session = document.querySelector('.session');
  const originalParent = session.parentNode;
  await state.openMini(); await flushPromises();
  expect(opened.document.body.querySelector('.session')).toBe(session);
  expect(document.querySelector('.session')).toBeNull();
  opened.close(); await flushPromises();
  expect(state.mini.value).toBe(false);
  expect(state.miniTarget.value).toBeNull();
  expect(session.parentNode).toBe(originalParent);
  expect(opened.close).toHaveBeenCalledTimes(1);
});

it('returns the live DOM before closing PiP and closes the popup on unmount', async () => {
  const first = popup(), second = popup();
  const state = fixture(vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
  const session = document.querySelector('.session');
  await state.openMini(); await flushPromises();
  const close = first.close.getMockImplementation();
  first.close.mockImplementation(() => { expect(document.querySelector('.session')).toBe(session); close(); });
  await state.closeMini();
  expect(first.close).toHaveBeenCalledTimes(1);
  await state.openMini(); await flushPromises();
  wrapper.unmount(); wrapper = null; await flushPromises();
  expect(second.close).toHaveBeenCalledTimes(1);
});

it.each(['restore', 'unmount'])('closes a delayed popup if %s occurs while the browser is opening it', async action => {
  let resolve;
  const opened = popup();
  const state = fixture(vi.fn(() => new Promise(done => { resolve = done; })));
  const pending = state.openMini();
  if (action === 'restore') await state.closeMini();
  else { wrapper.unmount(); wrapper = null; }
  resolve(opened); await pending; await flushPromises();
  expect(opened.close).toHaveBeenCalledTimes(1);
  expect(state.mini.value).toBe(false);
  expect(state.miniTarget.value).toBeNull();
});

it('uses in-page Mini when PiP is unavailable or the browser refuses it', async () => {
  const state = fixture(vi.fn().mockRejectedValue(new Error('Blocked')));
  await state.openMini(); await flushPromises();
  expect(state.mini.value).toBe(true);
  expect(state.miniTarget.value).toBeNull();
  expect(document.querySelector('.session').parentElement).toBe(document.body);
  await state.closeMini();
  vi.stubGlobal('documentPictureInPicture', undefined);
  await state.openMini();
  expect(state.mini.value).toBe(true);
});

it('does not retain a closed PiP document if a quick reopen falls back to in-page Mini', async () => {
  const opened = popup();
  const state = fixture(vi.fn().mockResolvedValueOnce(opened).mockRejectedValueOnce(new Error('Blocked')));
  const session = document.querySelector('.session');
  await state.openMini(); await flushPromises();
  const restoring = state.closeMini();
  const reopening = state.openMini();
  await Promise.all([restoring, reopening]); await flushPromises();
  expect(opened.closed).toBe(true);
  expect(state.mini.value).toBe(true);
  expect(state.miniTarget.value).toBeNull();
  expect(session.parentElement).toBe(document.body);
});
