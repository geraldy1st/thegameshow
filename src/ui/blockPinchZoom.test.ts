// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { blockPinchZoom } from './blockPinchZoom';

afterEach(() => {
  document.replaceChildren();
});

describe('blockPinchZoom (Z04)', () => {
  it('registers gesture* listeners with passive: false and preventDefault works', () => {
    const calls: { type: string; opts: AddEventListenerOptions | boolean | undefined }[] = [];
    const target = {
      addEventListener(
        type: string,
        _fn: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) {
        calls.push({ type, opts: opts as AddEventListenerOptions });
      },
    } as unknown as EventTarget;
    blockPinchZoom(target);
    expect(calls.map((c) => c.type)).toEqual(['gesturestart', 'gesturechange', 'gestureend']);
    for (const c of calls) {
      expect(c.opts).toEqual({ passive: false });
    }

    blockPinchZoom(document);
    const ev = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
