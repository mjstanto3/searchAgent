import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/layout/Navbar';
import { MonitorForm } from '@/components/monitor/MonitorForm';

export default async function NewMonitorPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Check monitor limit
  const { count } = await supabase
    .from('monitors')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) >= 10) {
    redirect('/dashboard?error=monitor_limit');
  }

  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar email={user.email} credits={credits?.balance ?? 0} />
      <main className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto mb-8 max-w-2xl">
          <h1 className="text-2xl font-bold text-slate-900">Create a new monitor</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set up your AI-powered research monitor in 5 quick steps.
          </p>
        </div>
        <MonitorForm userId={user.id} />
      </main>
    </div>
  );
}
