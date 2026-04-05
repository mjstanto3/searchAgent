import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/Sidebar';
import type { Credits } from '@/types';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: credits } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = (credits as Credits | null)?.balance ?? 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar email={user.email} credits={balance} />
      <div className="flex flex-1 flex-col pl-52">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
