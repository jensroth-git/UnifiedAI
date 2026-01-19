
export class TimeoutError extends Error {
  constructor(message = 'Timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class TimeoutPromise {
  private timeoutId: NodeJS.Timeout|null = null;
  private ms: number;

  public clear() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  public promise(): Promise<never> {
    return new Promise((_, reject) => {
      this.timeoutId = setTimeout(() => {
        reject(new TimeoutError(`AI request timed out after ${this.ms}ms`));
      }, this.ms);
    });
  }

  constructor(ms: number) {
    this.ms = ms;
  }
}

export type TimeoutOptions = {
  RequestTimeoutMS?: number,
  MaxRetries?: number,
  RetryDelayMS?: number,
  RetryBackoffFactor?: number,
  RetryNotified?: (info: RetryNotification) => void,
};

export type RetryNotification = {
  attempt: number,
  maxRetries: number,
  delayMs: number,
  error: unknown
};

type RetryableOperation<T> = (attempt: number) => Promise<T>;

const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_RETRY_BACKOFF = 2;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryErrorDefault(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as {name?: string};

  return maybeError.name === 'TimeoutError';
}

export async function runWithTimeoutAndRetry<T>(
    operation: RetryableOperation<T>,
    options?: TimeoutOptions,
    shouldRetryError: (error: unknown, attempt: number) => boolean = (error) =>
        shouldRetryErrorDefault(error),
    getRetryDelayMs?: (error: unknown, attempt: number) => number|undefined):
    Promise<T> {
  const maxRetries = options?.MaxRetries ?? 0;
  const timeoutMs = options?.RequestTimeoutMS ?? 0;
  const retryDelayMs = options?.RetryDelayMS ?? DEFAULT_RETRY_DELAY_MS;
  const retryBackoff = options?.RetryBackoffFactor ?? DEFAULT_RETRY_BACKOFF;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    try {
      if (timeoutMs > 0) {
        const timeout = new TimeoutPromise(timeoutMs);
        try {
          return await Promise.race([operation(attempt + 1), timeout.promise()]);
        } finally {
          timeout.clear();
        }
      }

      return await operation(attempt + 1);
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetryError(error, attempt + 1)) {
        throw error;
      }

      const overrideDelay = getRetryDelayMs?.(error, attempt + 1);
      const delay = overrideDelay ??
          (retryDelayMs * Math.pow(retryBackoff, attempt));
      if (options?.RetryNotified) {
        options.RetryNotified(
            {attempt: attempt + 1, maxRetries, delayMs: delay, error});
      }
      if (delay > 0) {
        await sleep(delay);
      }
    }

    attempt += 1;
  }

  throw lastError ?? new Error('Request failed after retries');
}