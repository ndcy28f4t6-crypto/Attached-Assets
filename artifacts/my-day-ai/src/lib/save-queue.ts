/**
 * Offline-queue utilities for persisting unsaved state across page reloads.
 *
 * Extracted from the useAppState hook so the queue/retry/toast logic can be
 * tested independently of React.  The hook passes a `storage` shim so tests
 * can run without a real browser sessionStorage.
 */

export const QUEUED_SAVE_KEY = 'my-day-ai-queued-save';

export type SaveFn = (data: unknown) => Promise<unknown>;
export type ToastFn = (args: { title: string; description: string }) => void;

export interface RetryContext {
  /** sessionStorage (or a compatible mock in tests). */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  toast: ToastFn;
  /**
   * Whether the "Changes saved locally" toast has already been shown during
   * this outage.  Pass `false` on the first attempt; the returned value
   * reflects whether it has now been shown.
   */
  queuedToastShown: boolean;
}

/**
 * Try to save `data` to the server (up to 3 attempts, exponential backoff).
 *
 * Success:
 *   – If a queued entry exists in storage, removes it and shows the
 *     "Changes synced" toast.
 *
 * Total failure (all 3 attempts throw):
 *   – Writes `data` to storage under `QUEUED_SAVE_KEY`.
 *   – Shows "Changes saved locally" toast once per outage.
 *
 * Returns `{ saved, queuedToastShown }` so the caller can update any ref.
 */
export async function saveWithRetry(
  saveFn: SaveFn,
  data: unknown,
  ctx: RetryContext,
): Promise<{ saved: boolean; queuedToastShown: boolean }> {
  let saved = false;
  let { queuedToastShown } = ctx;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await saveFn(data);
      saved = true;

      // A previous outage left a queued entry — clear it and notify the user.
      if (ctx.storage.getItem(QUEUED_SAVE_KEY)) {
        ctx.storage.removeItem(QUEUED_SAVE_KEY);
        queuedToastShown = false;
        ctx.toast({
          title: 'Changes synced',
          description: 'Your queued changes have been saved.',
        });
      }
      break;
    } catch {
      // Exponential backoff between attempts; skip delay after the last one.
      if (attempt < 3) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 300 * Math.pow(2, attempt - 1)),
        );
      }
    }
  }

  if (!saved) {
    ctx.storage.setItem(QUEUED_SAVE_KEY, JSON.stringify(data));
    if (!queuedToastShown) {
      queuedToastShown = true;
      ctx.toast({
        title: 'Changes saved locally',
        description:
          "Couldn't reach the server. Your changes are queued and will sync automatically.",
      });
    }
  }

  return { saved, queuedToastShown };
}

/**
 * If a queued payload is present in storage, attempt to flush it to the server.
 * On success: removes the storage entry and shows "Changes synced" toast.
 * On failure: leaves storage intact — the caller should retry later.
 */
export async function flushQueued(
  saveFn: SaveFn,
  ctx: Pick<RetryContext, 'storage' | 'toast'>,
): Promise<void> {
  const raw = ctx.storage.getItem(QUEUED_SAVE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw) as unknown;
    await saveFn(data);
    ctx.storage.removeItem(QUEUED_SAVE_KEY);
    ctx.toast({
      title: 'Changes synced',
      description: 'Your queued changes have been saved to the server.',
    });
  } catch {
    // Still offline — will retry on the next interval tick.
  }
}
