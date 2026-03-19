import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Use the service-role key for webhook handling (bypasses RLS for credit updates)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const creditsToAdd = parseInt(session.metadata?.credits ?? '0', 10);

    if (!userId || creditsToAdd <= 0) {
      return NextResponse.json({ error: 'Invalid metadata' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Add credits to the user's balance
    const { error: creditError } = await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: creditsToAdd,
      p_description: `Credit purchase via Stripe (${session.id})`,
      p_stripe_payment_id: session.payment_intent as string,
    });

    if (creditError) {
      console.error('Failed to add credits:', creditError);
      return NextResponse.json({ error: 'Credit update failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
