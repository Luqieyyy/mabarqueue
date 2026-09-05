import Image from 'next/image';
import Link from 'next/link';

const features = [
  ['queue', 'Automated queue intake', 'Turn successful viewer payments into organized queue entries without copying names between tools.'],
  ['dashboard', 'Live operations dashboard', 'See who is playing, who is next, and how many games remain from one dependable workspace.'],
  ['overlay', 'Stream-ready overlay', 'Keep viewers informed with a clean browser-source overlay that updates with your queue.'],
  ['payment', 'Creator payment records', 'Track packages, successful payments, and queue credits with creator-level separation.'],
];

const steps = [
  ['01', 'Publish your creator page', 'Choose your public handle and configure the game packages you want to offer.'],
  ['02', 'Accept a viewer order', 'The viewer submits their player details and selects a package from your page.'],
  ['03', 'Run the queue live', 'MabarQueue adds the player and keeps your dashboard, public queue, and overlay in sync.'],
];

function ProductIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    queue: <><path d="M5 6h14M5 12h14M5 18h9" /><circle cx="3" cy="6" r=".5" fill="currentColor" /><circle cx="3" cy="12" r=".5" fill="currentColor" /><circle cx="3" cy="18" r=".5" fill="currentColor" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    overlay: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3M7 9h10M7 13h6" /></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 15h4" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{paths[type]}</svg>;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <Image src="/mabarqueue.png" alt="" width={34} height={34} className="h-8 w-8 rounded-lg object-cover" priority />
            <span className="text-[15px] font-semibold tracking-tight">MabarQueue</span>
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <a href="#product" className="text-sm font-medium text-slate-600 hover:text-slate-950">Product</a>
            <a href="#workflow" className="text-sm font-medium text-slate-600 hover:text-slate-950">How it works</a>
            <a href="#packages" className="text-sm font-medium text-slate-600 hover:text-slate-950">Packages</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex">Sign in</Link>
            <Link href="/register" className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Create account</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.08),transparent_36%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-28">
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Built for Malaysian livestream creators
              </div>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
                Run every viewer queue with confidence.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
                Build one creator page for mabar sessions and direct donations. MabarQueue adapts the dashboard and stream tools to the game you play.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Start as a creator</Link>
                <a href="#product" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Explore the product</a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <span className="flex items-center gap-2"><CheckIcon /> No card required</span>
                <span className="flex items-center gap-2"><CheckIcon /> Set up in minutes</span>
                <span className="flex items-center gap-2"><CheckIcon /> MYR-ready</span>
              </div>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white py-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 text-center sm:flex-row sm:text-left lg:px-8">
            <p className="text-sm font-medium text-slate-500">One operating system for your live session</p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-semibold text-slate-700">
              <span>Mabar Queue</span><span>Donation alerts</span><span>Game-specific tools</span><span>OBS overlays</span>
            </div>
          </div>
        </section>

        <section id="product" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-600">Everything in one place</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Purpose-built for live queue operations</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">Mabar and donations are available across the platform. Extra modules appear only when they make sense for your game, such as Comment Album for Mobile Legends.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {features.map(([icon, title, description]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><ProductIcon type={icon} /></div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-200 bg-slate-50 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <p className="text-sm font-semibold text-blue-600">Simple workflow</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">From viewer order to the next game.</h2>
                <p className="mt-4 text-base leading-7 text-slate-600">A clear flow for creators and viewers, without adding more admin work during a livestream.</p>
              </div>
              <ol className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
                {steps.map(([number, title, description]) => (
                  <li key={number} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr]">
                    <span className="text-sm font-semibold text-blue-600">{number}</span>
                    <div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="packages" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_12px_40px_rgba(15,23,42,0.07)] sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-blue-600">Flexible game packages</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Start with sensible defaults. Adjust when you need to.</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">New creator workspaces include four starter packages in Malaysian Ringgit. You remain in control of your offer.</p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-0 lg:min-w-[440px]">
              {[['RM4', '1 game'], ['RM10', '3 games'], ['RM20', '6 games'], ['RM30', '10 games']].map(([price, games]) => (
                <div key={price} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center"><p className="text-xl font-semibold text-slate-900">{price}</p><p className="mt-1 text-xs font-medium text-slate-500">{games}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-5 py-20 text-center text-white">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready for a calmer livestream?</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">Create your creator workspace and manage your next queue from one place.</p>
            <Link href="/register" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-slate-950 hover:bg-slate-100">Create your workspace</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <div><div className="flex items-center gap-2"><Image src="/mabarqueue.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md" /><span className="text-sm font-semibold">MabarQueue</span></div><p className="mt-3 text-xs text-slate-500">Operated by LUQIEYYYDEV IT SOLUTION · Malaysia</p></div>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-500"><a href="#" className="hover:text-slate-900">Terms</a><a href="#" className="hover:text-slate-900">Privacy</a><a href="#" className="hover:text-slate-900">Refunds</a><a href="#" className="hover:text-slate-900">Contact</a></nav>
        </div>
      </footer>
    </div>
  );
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-emerald-600"><path d="m5 10 3 3 7-7" /></svg>;
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-5 rounded-[2rem] bg-blue-100/60 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_25px_70px_rgba(15,23,42,0.14)]">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /><span className="h-2.5 w-2.5 rounded-full bg-slate-200" /></div><span className="text-[10px] font-medium text-slate-400">Creator workspace</span></div>
        <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[128px_1fr]">
          <div className="border-r border-slate-200 bg-slate-50 p-3"><div className="mb-5 h-7 w-7 rounded-lg bg-blue-600" /><div className="space-y-2">{[true, false, false, false].map((active, index) => <div key={index} className={`h-7 rounded-md ${active ? 'bg-blue-100' : 'bg-slate-100'}`} />)}</div></div>
          <div className="p-4 sm:p-6">
            <div className="flex items-start justify-between"><div><div className="h-3 w-28 rounded bg-slate-800" /><div className="mt-2 h-2 w-40 rounded bg-slate-200" /></div><div className="h-8 w-20 rounded-lg bg-blue-600" /></div>
            <div className="mt-6 grid grid-cols-3 gap-2">{[['12', 'Players'], ['28', 'Games left'], ['4', 'Waiting']].map(([value, label]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><p className="text-base font-semibold text-slate-900">{value}</p><p className="mt-1 text-[9px] text-slate-400">{label}</p></div>)}</div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><span className="text-[10px] font-semibold text-slate-600">Waiting queue</span><span className="text-[9px] text-slate-400">Live</span></div>{['Akmal Plays', 'Naim Gaming', 'Faris ML'].map((name, index) => <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-slate-100 px-4 py-3"><span className="text-[10px] font-medium text-slate-700">{name}</span><span className="text-[9px] text-slate-400">{index + 2} games</span><span className="h-2 w-2 rounded-full bg-emerald-500" /></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
