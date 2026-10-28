/**
 * Rate Limiter for API requests and token usage
 * Prevents exceeding Anthropic API rate limits
 *
 * This implements a token bucket algorithm with sliding window.
 *
 * Concepts:
 * - Tracks requests and tokens used in the last 60 seconds (sliding window)
 * - Limits concurrent requests to prevent overwhelming the API
 * - Uses token estimation to prevent exceeding token-per-minute limits
 */

export interface RateLimiterConfig {
  /** Maximum requests per minute */
  maxRequestsPerMinute: number;
  /** Maximum tokens per minute */
  maxTokensPerMinute: number;
  /** Maximum concurrent requests */
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,      // Conservative default
  maxTokensPerMinute: 100000,    // ~100k tokens/min
  maxConcurrent: 5               // Max parallel requests
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

/**
 * Token bucket rate limiter with sliding window
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests: number = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
    for (const [name, value] of Object.entries(this.config)) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive integer`);
      }
    }
  }

  /**
   * Wait until a request can be made within rate limits
   *
   * This is the main entry point for rate limiting.
   * It ensures:
   * 1. Concurrent request limit is not exceeded
   * 2. Request and token rate limits are respected
   * 3. The request is recorded for future rate limit calculations
   *
   * @param estimatedTokens - Estimated tokens for this request
   */
  async acquire(estimatedTokens: number = 1000): Promise<void> {
    this.validateEstimatedTokens(estimatedTokens);
    await this.waitForSlot();

    try {
      await this.waitForRateLimit(estimatedTokens);
      this.requestHistory.push({ timestamp: Date.now(), tokens: estimatedTokens });
    } catch (error) {
      this.release();
      throw error;
    }
  }

  /**
   * Release a request slot after completion
   * @param actualTokens - Actual tokens used (updates estimate)
   */
  release(actualTokens?: number): void {
    if (
      actualTokens !== undefined &&
      (!Number.isFinite(actualTokens) || actualTokens < 0)
    ) {
      throw new RangeError('actualTokens must be a non-negative finite number');
    }

    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Update last request with actual token count if provided
    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.tokens = actualTokens;
      }
    }

    // Wake up next waiting request
    const next = this.waitQueue.shift();
    if (next) {
      this.activeRequests += 1;
      next();
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();

    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce((sum, r) => sum + r.tokens, 0);

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(0, this.config.maxRequestsPerMinute - requestsInWindow),
      availableTokens: Math.max(0, this.config.maxTokensPerMinute - tokensInWindow)
    };
  }

  /**
   * Check if request can proceed immediately
   *
   * @param estimatedTokens - Estimated tokens for the request
   * @returns true if the request can proceed without waiting
   */
  canProceed(estimatedTokens: number = 1000): boolean {
    this.validateEstimatedTokens(estimatedTokens);
    this.pruneOldRecords();
    return (
      this.activeRequests < this.config.maxConcurrent &&
      this.canProceedWithinRateLimits(estimatedTokens)
    );
  }

  /**
   * Wait for a concurrent request slot to become available
   *
   * This creates a Promise that resolves when release() is called
   * and there's a queued waiter.
   */
  private async waitForSlot(): Promise<void> {
    if (this.activeRequests >= this.config.maxConcurrent) {
      await new Promise<void>(resolve => this.waitQueue.push(resolve));
    } else {
      this.activeRequests += 1;
    }
  }

  /**
   * Wait until rate limits allow the request to proceed
   *
   * This implements the sliding window algorithm.
   * If we can't proceed immediately, we calculate how long to wait
   * until the oldest request expires (falls out of the 60-second window).
   *
   * @param estimatedTokens - Estimated tokens for the request
   */
  private async waitForRateLimit(estimatedTokens: number): Promise<void> {
    if (estimatedTokens > this.config.maxTokensPerMinute) {
      throw new RangeError(
        'estimatedTokens cannot exceed the configured maxTokensPerMinute'
      );
    }

    while (true) {
      this.pruneOldRecords();
      if (this.canProceedWithinRateLimits(estimatedTokens)) {
        return;
      }

      const oldest = this.requestHistory[0];
      if (!oldest) {
        throw new Error('Rate limit is unavailable despite an empty request window');
      }

      const remainingWindow = oldest.timestamp + 60_000 - Date.now();
      const waitMs = Math.min(5_000, Math.max(100, remainingWindow + 10));
      await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Remove request records older than 60 seconds (sliding window)
   *
   * This is called before checking rate limits to ensure we only
   * count requests in the current 60-second window.
   */
  private pruneOldRecords(): void {
    const cutoff = Date.now() - 60_000;
    this.requestHistory = this.requestHistory.filter(record => record.timestamp > cutoff);
  }

  private canProceedWithinRateLimits(estimatedTokens: number): boolean {
    const tokensInWindow = this.requestHistory.reduce(
      (sum, record) => sum + record.tokens,
      0
    );
    return (
      this.requestHistory.length < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
    );
  }

  private validateEstimatedTokens(estimatedTokens: number): void {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new RangeError('estimatedTokens must be a non-negative finite number');
    }
  }
}

/**
 * Wrap an async function with rate limiting
 *
 * This is a convenience function for applying rate limiting to any async operation.
 */
export function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens: number = 1000
): Promise<T> {
  return (async () => {
    await rateLimiter.acquire(estimatedTokens);
    try {
      return await fn();
    } finally {
      rateLimiter.release();
    }
  })();
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();