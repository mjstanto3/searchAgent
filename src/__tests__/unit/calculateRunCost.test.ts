import { calculateRunCost } from '@/lib/stripe/client';

describe('calculateRunCost', () => {
  it('returns max_results * 2 with no document', () => {
    expect(calculateRunCost(1, false)).toBe(2);
    expect(calculateRunCost(5, false)).toBe(10);
    expect(calculateRunCost(10, false)).toBe(20);
  });

  it('adds 3 extra credits when a document is attached', () => {
    expect(calculateRunCost(1, true)).toBe(5);
    expect(calculateRunCost(5, true)).toBe(13);
  });

  it('handles zero max_results gracefully', () => {
    expect(calculateRunCost(0, false)).toBe(0);
    expect(calculateRunCost(0, true)).toBe(3);
  });
});
