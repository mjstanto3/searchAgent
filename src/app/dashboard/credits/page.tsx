import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CREDIT_BUNDLES, formatPrice } from '@/lib/stripe/client';
import { Zap, CheckCircle2 } from 'lucide-react';
import type { Credits, CreditTransaction } from '@/types';

export default async function CreditsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const [{ data: credits }, { data: transactions }] = await Promise.all([
    supabase.from('credits').select('balance').eq('user_id', user.id).single(),
    supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const balance = (credits as Credits | null)?.balance ?? 0;
  const txList = (transactions as CreditTransaction[]) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar email={user.email} credits={balance} />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Credits</h1>
          <p className="mt-1 text-sm text-slate-500">
            Purchase credit bundles to power your research monitors.
          </p>
        </div>

        <div className="mb-8 flex items-center gap-4 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            <Zap className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Current balance</p>
            <p className="text-3xl font-bold text-slate-900">{balance}</p>
          </div>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-slate-900">Purchase credits</h2>
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {CREDIT_BUNDLES.map((bundle) => (
            <Card
              key={bundle.id}
              className={bundle.id === 'pro' ? 'border-indigo-300 ring-2 ring-indigo-600' : ''}
            >
              {bundle.id === 'pro' && (
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </div>
              )}
              <CardHeader>
                <CardTitle>{bundle.name}</CardTitle>
                <CardDescription>{bundle.credits} credits</CardDescription>
              </CardHeader>
              <p className="mb-4 text-3xl font-bold text-slate-900">
                {formatPrice(bundle.price)}
              </p>
              <ul className="mb-6 space-y-1 text-sm text-slate-500">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ~{Math.floor(bundle.credits / 4)} monitor runs
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Never expires
                </li>
              </ul>
              <form action="/api/stripe/checkout" method="POST">
                <input type="hidden" name="priceId" value={bundle.priceId} />
                <input type="hidden" name="credits" value={bundle.credits} />
                <Button type="submit" className="w-full" variant={bundle.id === 'pro' ? 'primary' : 'secondary'}>
                  Buy {bundle.name}
                </Button>
              </form>
            </Card>
          ))}
        </div>

        {txList.length > 0 && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Transaction history
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 text-slate-700">{tx.description}</td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
