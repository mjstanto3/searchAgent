import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

// Keep named export for convenience
export const stripe = {
  get checkout() { return getStripe().checkout; },
  get webhooks() { return getStripe().webhooks; },
};

export const CREDIT_BUNDLES = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 50,
    price: 799, // $7.99
    priceId: process.env.STRIPE_PRICE_STARTER ?? 'price_starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 150,
    price: 1999, // $19.99
    priceId: process.env.STRIPE_PRICE_PRO ?? 'price_pro',
  },
  {
    id: 'team',
    name: 'Team',
    credits: 500,
    price: 5999, // $59.99
    priceId: process.env.STRIPE_PRICE_TEAM ?? 'price_team',
  },
] as const;

/** Cost in credits per monitor run */
export function calculateRunCost(
  numSearches: number,
  hasDocument: boolean,
): number {
  const base = numSearches * 2;
  const docExtra = hasDocument ? 3 : 0;
  return base + docExtra;
}

/**
 * Formats a price in cents to a dollar string.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
