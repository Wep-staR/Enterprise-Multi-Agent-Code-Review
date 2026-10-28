import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout
} from '../src/utils/error-handler.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withRetry', () => {
  it('returns a successful operation result without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('done');
    await expect(withRetry(operation, 2, 0)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries failures and wraps exhausted attempts with a typed error', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const operation = vi.fn().mockRejectedValue(new Error('temporary outage'));

    await expect(withRetry(operation, 2, 0)).rejects.toMatchObject({
      code: ErrorCodes.RETRY_EXHAUSTED,
      metadata: { attempts: 3 }
    });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors marked as non-retryable', async () => {
    const error = new Error('invalid request');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, 3, 0, () => false)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  it('returns a result that completes before the deadline', async () => {
    await expect(withTimeout(async () => 'ok', 100)).resolves.toBe('ok');
  });

  it('rejects with an agent timeout error when the deadline expires', async () => {
    await expect(withTimeout(
      () => new Promise(resolve => setTimeout(resolve, 50)),
      1,
      'review timed out'
    )).rejects.toEqual(expect.objectContaining<Partial<ReviewError>>({
      code: ErrorCodes.AGENT_TIMEOUT,
      message: 'review timed out',
      metadata: { timeoutMs: 1 }
    }));
  });
});
