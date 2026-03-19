import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Zap, Search, Mail, Shield, Clock, ChevronRight } from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      icon: Search,
      title: 'AI-powered research',
      description:
        "Claude reads the web so you don't have to. Get synthesized intelligence, not raw search results.",
    },
    {
      icon: Clock,
      title: 'Scheduled delivery',
      description:
        'Set it once. Receive daily, weekly, or biweekly briefs in your inbox without lifting a finger.',
    },
    {
      icon: Mail,
      title: 'Email-first',
      description:
        'Briefs arrive in your inbox — formatted, concise, and ready to act on. No app to open.',
    },
    {
      icon: Shield,
      title: 'Secure by default',
      description:
        'Row-level security, server-side API calls, and no client-side secrets. Built for professionals.',
    },
  ];

  const useCases = [
    {
      title: 'Competitive intelligence',
      description: 'Track competitors and market signals while you focus on building.',
      emoji: '🎯',
    },
    {
      title: 'Industry briefings',
      description: 'Weekly industry digest for consultants and operators who need to stay sharp.',
      emoji: '📊',
    },
    {
      title: 'Job search intel',
      description: 'Track target companies, role postings, and news to ace your interviews.',
      emoji: '💼',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900">SearchAgent</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Get started free</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="px-4 pb-20 pt-24 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <Zap className="h-3.5 w-3.5" />
            AI reads the internet for you
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            Market research,{' '}
            <span className="text-indigo-600">on autopilot</span>
          </h1>
          <p className="mt-6 text-xl text-slate-500">
            Configure a research monitor in 5 minutes. Get curated intelligence briefs delivered to your inbox on a schedule you set.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2">
                Start for free
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button variant="secondary" size="lg">Sign in</Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400">10 free credits on signup · No credit card required</p>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900">
            Everything you need, nothing you don&apos;t
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                  <feature.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="mb-1 font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-slate-900">
            Built for people who value their time
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {useCases.map((uc) => (
              <div
                key={uc.title}
                className="rounded-xl border border-slate-200 bg-white p-6 text-center"
              >
                <div className="mb-3 text-4xl">{uc.emoji}</div>
                <h3 className="mb-1 font-semibold text-slate-900">{uc.title}</h3>
                <p className="text-sm text-slate-500">{uc.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-indigo-600 px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-4 text-3xl font-bold text-white">
            Ready to stay ahead?
          </h2>
          <p className="mb-8 text-indigo-200">
            Set up your first research monitor in under 5 minutes.
          </p>
          <Link href="/auth/signup">
            <Button
              size="lg"
              className="gap-2 bg-white text-indigo-600 hover:bg-indigo-50"
            >
              Get started free
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
        <p>© 2025 SearchAgent. All rights reserved.</p>
      </footer>
    </div>
  );
}
