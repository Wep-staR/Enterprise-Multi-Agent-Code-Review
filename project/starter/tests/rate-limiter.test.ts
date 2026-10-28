import { describe, expect, it } from 'vitest';
import { RateLimiter, withRateLimit } from '../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  it('enforces request and token limits within the window', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 10,
      maxConcurrent: 2
    });

    expect(limiter.canProceed(10)).toBe(true);
    await limiter.acquire(7);
    expect(limiter.canProceed(3)).toBe(true);
    expect(limiter.canProceed(4)).toBe(false);
    limiter.release();
    await limiter.acquire(3);
    expect(limiter.canProceed(0)).toBe(false);
    limiter.release();
    expect(limiter.getStatus()).toMatchObject({
      activeRequests: 0,
      requestsInWindow: 2,
      tokensInWindow: 10
    });
  });

  it('reserves and releases concurrent request slots in order', async () => {
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 10,
      maxTokensPerMinute: 100,
      maxConcurrent: 1
    });
    await limiter.acquire(1);

    let secondAcquired = false;
    const second = limiter.acquire(1).then(() => {
      secondAcquired = true;
    });
    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    limiter.release();
    await second;
    expect(limiter.getStatus().activeRequests).toBe(1);
    limiter.release();
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('releases its active slot when a rate-limited operation fails', async () => {
    const limiter = new RateLimiter({ maxConcurrent: 1 });
    await expect(withRateLimit(limiter, async () => {
      throw new Error('operation failed');
    }, 1)).rejects.toThrow('operation failed');
    expect(limiter.getStatus().activeRequests).toBe(0);
  });

  it('rejects invalid limits and estimates that can never fit', async () => {
    expect(() => new RateLimiter({ maxConcurrent: 0 })).toThrow(RangeError);
    const limiter = new RateLimiter({ maxTokensPerMinute: 10 });
    expect(() => limiter.canProceed(-1)).toThrow(RangeError);
    await expect(limiter.acquire(11)).rejects.toThrow(RangeError);
  });
});
