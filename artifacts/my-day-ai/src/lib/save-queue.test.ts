import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushQueued, QUEUED_SAVE_KEY, saveWithRetry } from './save-queue';

// ─── In-memory sessionStorage stand-in ──────────────────────────────────────

function makeStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

// ─── saveWithRetry ───────────────────────────────────────────────────────────

describe('saveWithRetry', () => {
  let storage: ReturnType<typeof makeStorage>;
  let toast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = makeStorage();
    toast = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes to sessionStorage and shows "Changes saved locally" toast on total failure', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const data = { tasks: [], _clientRevision: null };

    const resultPromise = saveWithRetry(saveFn, data, {
      storage,
      toast,
      queuedToastShown: false,
    });

    // Drain all retry backoff timers so the promise can settle
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.saved).toBe(false);
    expect(saveFn).toHaveBeenCalledTimes(3); // three attempts
    expect(storage.getItem(QUEUED_SAVE_KEY)).toBe(JSON.stringify(data));
    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Changes saved locally' }),
    );
    expect(result.queuedToastShown).toBe(true);
  });

  it('does not show "Changes saved locally" toast again when already shown', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const data = { tasks: [] };

    const resultPromise = saveWithRetry(saveFn, data, {
      storage,
      toast,
      queuedToastShown: true, // already shown during this outage
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.saved).toBe(false);
    expect(storage.getItem(QUEUED_SAVE_KEY)).toBe(JSON.stringify(data));
    // Toast must NOT be called a second time
    expect(toast).not.toHaveBeenCalled();
    expect(result.queuedToastShown).toBe(true);
  });

  it('clears sessionStorage and shows "Changes synced" toast when server recovers', async () => {
    // Simulate a queued entry left over from a previous outage
    storage.setItem(QUEUED_SAVE_KEY, JSON.stringify({ tasks: [] }));

    const saveFn = vi.fn().mockResolvedValue({ _revision: 2 });
    const data = { tasks: [{ id: 't1' }], _clientRevision: 1 };

    const resultPromise = saveWithRetry(saveFn, data, {
      storage,
      toast,
      queuedToastShown: true,
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.saved).toBe(true);
    expect(saveFn).toHaveBeenCalledOnce(); // succeeded on first attempt
    expect(storage.getItem(QUEUED_SAVE_KEY)).toBeNull();
    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Changes synced' }),
    );
    expect(result.queuedToastShown).toBe(false); // reset after successful sync
  });

  it('succeeds without showing any toast when no queue entry exists', async () => {
    const saveFn = vi.fn().mockResolvedValue({ _revision: 1 });
    const data = { tasks: [] };

    const resultPromise = saveWithRetry(saveFn, data, {
      storage,
      toast,
      queuedToastShown: false,
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.saved).toBe(true);
    expect(storage.getItem(QUEUED_SAVE_KEY)).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
});

// ─── flushQueued ─────────────────────────────────────────────────────────────

describe('flushQueued', () => {
  let storage: ReturnType<typeof makeStorage>;
  let toast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = makeStorage();
    toast = vi.fn();
  });

  it('does nothing when sessionStorage has no queued entry', async () => {
    const saveFn = vi.fn();
    await flushQueued(saveFn, { storage, toast });
    expect(saveFn).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('flushes queued payload and shows "Changes synced" toast on server recovery', async () => {
    const queued = { tasks: [{ id: 't1', title: 'Test task' }] };
    storage.setItem(QUEUED_SAVE_KEY, JSON.stringify(queued));

    const saveFn = vi.fn().mockResolvedValue({ _revision: 5 });
    await flushQueued(saveFn, { storage, toast });

    expect(saveFn).toHaveBeenCalledWith(queued);
    expect(storage.getItem(QUEUED_SAVE_KEY)).toBeNull();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Changes synced' }),
    );
  });

  it('leaves sessionStorage intact when server is still unreachable', async () => {
    const queued = { tasks: [{ id: 't2' }] };
    storage.setItem(QUEUED_SAVE_KEY, JSON.stringify(queued));

    const saveFn = vi.fn().mockRejectedValue(new Error('Still offline'));
    await flushQueued(saveFn, { storage, toast });

    expect(storage.getItem(QUEUED_SAVE_KEY)).toBe(JSON.stringify(queued));
    expect(toast).not.toHaveBeenCalled();
  });
});
