'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Zap } from 'lucide-react';

interface NavbarProps {
  email?: string;
  credits?: number;
}

export function Navbar({ email, credits }: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">SearchAgent</span>
        </Link>

        <nav className="flex items-center gap-4">
          {credits !== undefined && (
            <Link
              href="/dashboard/credits"
              className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <Zap className="h-3.5 w-3.5" />
              {credits} credits
            </Link>
          )}
          {email && (
            <span className="hidden text-sm text-slate-500 sm:block">
              {email}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  );
}
