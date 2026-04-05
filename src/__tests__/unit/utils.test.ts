import { getNextRunDate, formatCredits, formatPrice, checkRateLimit } from '@/lib/utils';

describe('getNextRunDate', () => {
  it('returns ~1 day ahead for daily frequency', () => {
    const before = Date.now();
    const result = getNextRunDate('daily');
    const diffMs = result.getTime() - before;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(0.99);
    expect(diffDays).toBeLessThan(1.01);
  });

  it('returns ~7 days ahead for weekly frequency', () => {
    const before = Date.now();
    const result = getNextRunDate('weekly');
    const diffMs = result.getTime() - before;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.99);
    expect(diffDays).toBeLessThan(7.01);
  });

  it('returns ~14 days ahead for biweekly frequency', () => {
    const before = Date.now();
    const result = getNextRunDate('biweekly');
    const diffMs = result.getTime() - before;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(13.99);
    expect(diffDays).toBeLessThan(14.01);
  });
});

describe('formatCredits', () => {
  it('returns singular for 1 credit', () => {
    expect(formatCredits(1)).toBe('1 credit');
  });

  it('returns plural for 0 or more than 1', () => {
    expect(formatCredits(0)).toBe('0 credits');
    expect(formatCredits(10)).toBe('10 credits');
  });
});

describe('formatPrice', () => {
  it('formats cents to dollar string', () => {
    expect(formatPrice(799)).toBe('$7.99');
    expect(formatPrice(1999)).toBe('$19.99');
    expect(formatPrice(5999)).toBe('$59.99');
  });
});

describe('checkRateLimit', () => {
  it('allows requests within the limit', () => {
    const key = `test-${Date.now()}`;
    const result = checkRateLimit(key, 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('blocks when limit is exceeded', () => {
    const key = `test-block-${Date.now()}`;
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);
    const result = checkRateLimit(key, 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
