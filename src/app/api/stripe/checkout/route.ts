import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, CREDIT_BUNDLES } from '@/lib/stripe/client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let priceId: string;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    priceId = body.priceId;
  } else {
    const formData = await request.formData();
    priceId = formData.get('priceId') as string;
  }

  // Validate that the priceId belongs to a known bundle
  const bundle = CREDIT_BUNDLES.find((b) => b.priceId === priceId);
  if (!bundle) {
    return NextResponse.json({ error: 'Invalid price selection' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    success_url: `${appUrl}/magpie/credits?success=1&credits=${bundle.credits}`,
    cancel_url: `${appUrl}/magpie/credits?canceled=1`,
    customer_email: user.email,
    metadata: {
      userId: user.id,
      credits: String(bundle.credits),
    },
  });

  return NextResponse.redirect(session.url!, { status: 303 });
}
