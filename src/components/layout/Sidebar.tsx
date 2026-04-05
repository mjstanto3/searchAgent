'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Zap } from 'lucide-react';

interface SidebarProps {
  email?: string;
  credits?: number;
}

const NAV_ITEMS = [
  { label: 'Magpie', href: '/magpie' },
  { label: 'Osprey', href: '/osprey' },
];

export function Sidebar({ email, credits }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 flex w-52 flex-col border-r border-slate-200 bg-white">
      {/* Main nav */}
      <nav className="flex flex-col gap-1 p-4 pt-6">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 p-4">
        {credits !== undefined && (
          <Link
            href="/magpie/credits"
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Zap className="h-3.5 w-3.5 text-indigo-500" />
            {credits} credits
          </Link>
        )}
        <Link
          href="/billing"
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname === '/billing'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Billing
        </Link>
        {email && (
          <p className="truncate px-3 py-1 text-xs text-slate-400">{email}</p>
        )}
        <Button variant="ghost" size="sm" className="justify-start" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}
