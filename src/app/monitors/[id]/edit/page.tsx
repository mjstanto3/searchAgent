import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { Card } from '@/components/ui/Card';
import { EditMonitorForm } from '@/components/monitor/EditMonitorForm';
import type { Monitor, Credits } from '@/types';
import { ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMonitorPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const [{ data: monitor }, { data: credits }] = await Promise.all([
    supabase.from('monitors').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('credits').select('balance').eq('user_id', user.id).single(),
  ]);

  if (!monitor) notFound();

  const balance = (credits as Credits | null)?.balance ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar email={user.email} credits={balance} />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href={`/monitors/${id}`}
            className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to monitor
          </Link>

          <h1 className="text-2xl font-bold text-slate-900">Edit monitor</h1>
          <p className="mt-1 text-sm text-slate-500">{monitor.name}</p>
        </div>

        <Card>
          <EditMonitorForm monitor={monitor as Monitor} />
        </Card>
      </main>
    </div>
  );
}
