import { useState } from 'react'
import { ArrowRight, BadgeCheck, Boxes, ChevronDown, Clock, FileSpreadsheet, FileText, Keyboard, MessageCircle, Phone, RefreshCw, Printer, ShieldCheck, Smartphone, Users, WifiOff, X, Check, Menu } from 'lucide-react'
import { SUPPORT_PHONE_DISPLAY, supportTel, supportWhatsApp } from '@/lib/support'
import { go } from './nav'
import { BillMock, DashboardMock, PhoneMock, StockMock } from './mocks'
import faqData from './faq.json'
import plansData from './plans.json'

const start = () => go('/signup')
const login = () => go('/login')
const wa = (msg: string) => `${supportWhatsApp}?text=${encodeURIComponent(msg)}`

const NAV = [['Features', 'features'], ['How it works', 'how'], ['Pricing', 'pricing'], ['FAQ', 'faq'], ['Contact', 'contact']] as const
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${light ? 'bg-white text-primary' : 'bg-primary text-white'}`}>₹</span>RapidBill
    </div>
  )
}

function Cta({ children = 'Start Free', big = false, light = false }: { children?: string; big?: boolean; light?: boolean }) {
  return (
    <button onClick={start} className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition hover:-translate-y-0.5 ${big ? 'h-14 px-8 text-lg' : 'h-11 px-5 text-base'} ${light ? 'bg-white text-primary shadow-lg hover:bg-primary-soft' : 'bg-primary text-white shadow-[0_10px_24px_-8px_rgb(53_86_216/0.7)] hover:bg-primary-hover'}`}>
      {children}<ArrowRight size={big ? 20 : 17} />
    </button>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="RapidBill home"><Logo /></button>
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map(([l, id]) => <button key={id} onClick={() => jump(id)} className="text-[15px] font-medium text-ink-600 hover:text-primary">{l}</button>)}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={login} className="hidden h-11 rounded-xl px-4 text-[15px] font-semibold text-ink-900 hover:bg-sunken sm:block">Log in</button>
          <Cta>Start Free</Cta>
          <button className="grid h-11 w-11 place-items-center rounded-xl hover:bg-sunken lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-white px-5 py-3 lg:hidden">
          {NAV.map(([l, id]) => <button key={id} onClick={() => { setOpen(false); jump(id) }} className="block w-full py-3 text-left text-base font-medium">{l}</button>)}
          <button onClick={login} className="block w-full py-3 text-left text-base font-semibold text-primary">Log in</button>
        </div>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-soft via-white to-white">
      <div className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(rgb(53_86_216/0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-1.5 text-sm font-semibold text-primary shadow-sm"><BadgeCheck size={16} />Made for shops in India · GST ready</span>
          <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-ok px-4 py-1.5 text-sm font-bold text-white shadow-sm"><WifiOff size={15} />Works offline</span>
          <h1 className="mt-6 text-[clamp(2.4rem,5.4vw,4rem)] font-extrabold leading-[1.05] tracking-tight text-ink-900">
            Best Billing Software<br />for <span className="text-primary">Small Business</span>
          </h1>
          <p className="mt-6 max-w-xl text-[clamp(1.05rem,1.6vw,1.3rem)] leading-relaxed text-ink-600">
            Still using paper bills? Make GST bills in seconds, keep track of your stock, and bill from anywhere using your phone. Even when the internet is down.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Cta big>Start Free</Cta>
            <button onClick={() => jump('how')} className="h-14 rounded-xl border border-line bg-white px-7 text-lg font-semibold text-ink-900 hover:border-primary hover:text-primary">See how it works</button>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-ink-600">
            {['15 days free', 'No card needed', 'Set up in 2 minutes'].map((x) => <li key={x} className="flex items-center gap-1.5"><Check size={17} className="text-ok" strokeWidth={3} />{x}</li>)}
          </ul>
        </div>
        <div className="relative pb-10 sm:pr-10">
          <DashboardMock />
          <PhoneMock className="absolute -bottom-2 right-0 hidden rotate-3 sm:block" />
        </div>
      </div>
    </section>
  )
}

function Proof() {
  return (
    <section className="border-y border-line bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-center md:grid-cols-4">
        {[['GST', 'Tax invoices ready'], ['Offline', 'Bill even with no internet'], ['Phone + PC', 'One account, all devices'], ['15 days', 'Free to try']].map(([a, b]) => (
          <div key={a}><div className="text-2xl font-extrabold text-primary">{a}</div><div className="mt-0.5 text-[15px] text-ink-600">{b}</div></div>
        ))}
      </div>
    </section>
  )
}

function Title({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-14 max-w-2xl text-center">
      <div className="text-sm font-bold uppercase tracking-widest text-primary">{kicker}</div>
      <h2 className="mt-3 text-[clamp(1.9rem,3.6vw,2.8rem)] font-extrabold leading-tight tracking-tight">{title}</h2>
      {sub && <p className="mt-4 text-lg text-ink-600">{sub}</p>}
    </div>
  )
}

function Offline() {
  const pts = [
    ['No internet? No problem.', 'Keep making bills when the network is slow or gone. Nothing stops.'],
    ['Saved on your device', 'Every bill is stored safely on your phone or computer the moment you save it.'],
    ['Syncs by itself', 'When the internet is back, everything goes to the cloud on its own. No button to press.'],
  ]
  return (
    <section className="bg-gradient-to-br from-nav via-[#16224a] to-primary py-20 text-white md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold"><WifiOff size={16} />Works offline</span>
          <h2 className="mt-5 text-[clamp(2rem,4vw,3.1rem)] font-extrabold leading-tight tracking-tight">Internet down?<br />Your shop keeps running.</h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">Power cuts, weak network, shop in a basement or a market. Customers will not wait. With RapidBill you never have to say, “system is down”.</p>
          <div className="mt-8"><Cta light big>Start Free</Cta></div>
        </div>
        <div className="space-y-4">
          {pts.map(([t, d], i) => (
            <div key={t} className="flex gap-5 rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-primary">{[<WifiOff key="a" size={24} />, <ShieldCheck key="b" size={24} />, <RefreshCw key="c" size={24} />][i]}</div>
              <div><div className="text-xl font-bold">{t}</div><p className="mt-1 text-[16px] leading-relaxed text-white/75">{d}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PaperVsApp() {
  const paper = ['Bills get lost or torn', 'Totals go wrong, tax is a headache', 'Hours spent at month end', 'You never know what is in stock']
  const app = ['Every bill saved safely, find it in seconds', 'Totals and GST are always right', 'Sales and tax report ready any time', 'Stock goes down by itself when you bill']
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Title kicker="Time to move on" title="Still using paper bills?" sub="Paper is slow, and mistakes cost you money. RapidBill does the boring work for you." />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-sunken/60 p-8">
            <div className="mb-5 text-xl font-bold text-ink-600">Paper bills</div>
            <ul className="space-y-4">{paper.map((x) => <li key={x} className="flex items-start gap-3 text-lg text-ink-600"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"><X size={14} strokeWidth={3} /></span>{x}</li>)}</ul>
          </div>
          <div className="rounded-3xl bg-primary p-8 text-white shadow-[0_30px_60px_-25px_rgb(53_86_216/0.8)]">
            <div className="mb-5 text-xl font-bold">With RapidBill</div>
            <ul className="space-y-4">{app.map((x) => <li key={x} className="flex items-start gap-3 text-lg"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-primary"><Check size={14} strokeWidth={3.5} /></span>{x}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { i: FileText, t: 'GST bills in seconds', d: 'Make tax invoices and challans with GST worked out for you. Print them neat and ready to hand over.' },
  { i: Smartphone, t: 'Bill from anywhere', d: 'Use your phone, tablet or computer. Make a bill at the counter, at the godown, or at the customer’s shop.' },
  { i: WifiOff, t: 'Works offline', d: 'Network gone? Keep billing. Everything saves on your device and syncs by itself when you are back online.' },
  { i: Boxes, t: 'Stock that updates itself', d: 'Every bill reduces your stock. See what is running low before you run out.' },
  { i: Keyboard, t: 'Super fast billing', d: 'Type a few letters, pick the item, press Enter. Built so a whole bill takes a few seconds.' },
  { i: Users, t: 'Customers and suppliers', d: 'Keep all your parties in one place. Bring your old list from Excel in one go.' },
  { i: Printer, t: 'Print in English or Hindi', d: 'Bills your customers can read easily, in the language they like.' },
  { i: FileSpreadsheet, t: 'Reports and backup', d: 'See today’s sales and monthly tax at a glance. Download your data any time. It is always yours.' },
]

function Answer() {
  const points = ['Make a GST bill in seconds: type a few letters, press Enter', 'Works offline, and syncs by itself when the internet is back', 'Stock goes down on every bill, so you know what to reorder', 'Bill from your phone, tablet or computer with one account', 'Print in English or Hindi, and get help on call or WhatsApp']
  return (
    <section className="bg-white py-14 md:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-[clamp(1.6rem,3vw,2.3rem)] font-extrabold leading-tight tracking-tight">RapidBill is the easiest and best billing software for small business and shops in India</h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-600">RapidBill is GST billing and stock software made for shopkeepers, traders and small businesses: grocery, pharmacy, electrical, hardware, furniture and more. It is the easiest way to make bills, keep stock and know who owes you, with nothing to learn and no per-bill charges. Try it free for 15 days.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {points.map((x) => <li key={x} className="flex items-start gap-3 text-[16px]"><Check size={18} className="mt-1 shrink-0 text-ok" strokeWidth={3} />{x}</li>)}
        </ul>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16 bg-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Title kicker="Features" title="Everything you need to run your shop" sub="Simple to learn. No training needed." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.t} className="group rounded-2xl border border-line/80 bg-white p-6 shadow-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-float">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-white"><f.i size={24} /></div>
              <h3 className="mt-5 text-lg font-bold">{f.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Showcase() {
  return (
    <section className="overflow-hidden bg-nav py-20 text-white md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div>
          <div className="text-sm font-bold uppercase tracking-widest text-[#9db3ff]">Fast at the counter</div>
          <h2 className="mt-3 text-[clamp(1.9rem,3.6vw,2.8rem)] font-extrabold leading-tight tracking-tight">A full bill in the time it takes to write one line</h2>
          <p className="mt-5 text-lg leading-relaxed text-white/75">Pick the customer, add the items, save. GST and totals appear as you type. Print, or share it with your customer.</p>
          <ul className="mt-8 space-y-4 text-lg">
            {['Find any item by typing a few letters', 'See stock and last price while you bill', 'Save and start the next bill right away'].map((x) => <li key={x} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15"><Check size={15} strokeWidth={3} /></span>{x}</li>)}
          </ul>
          <div className="mt-9"><Cta light big>Start Free</Cta></div>
        </div>
        <div className="relative"><BillMock /><div className="absolute -bottom-10 -left-4 hidden w-64 sm:block"><StockMock /></div></div>
      </div>
    </section>
  )
}

function How() {
  const steps = [
    ['1', 'Sign up free', 'Tell us your shop name. It takes two minutes. No card needed.'],
    ['2', 'Add items and customers', 'Type them in, or bring your list from Excel.'],
    ['3', 'Start billing', 'Make your first GST bill and print or share it.'],
  ]
  return (
    <section id="how" className="scroll-mt-16 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Title kicker="How it works" title="Start billing in 3 easy steps" />
        <div className="relative grid gap-8 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-primary/30 md:block" />
          {steps.map(([n, t, d]) => (
            <div key={n} className="relative text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary text-2xl font-extrabold text-white shadow-[0_12px_24px_-8px_rgb(53_86_216/0.7)]">{n}</div>
              <h3 className="mt-5 text-xl font-bold">{t}</h3>
              <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink-600">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const inc = ['Unlimited bills, items and parties', 'Works offline', 'GST invoices and stock tracking', 'Hindi and English', 'Support on call and WhatsApp', 'All new updates, free']
  const off = (y: { price: number; was: number }) => Math.round((1 - y.price / y.was) * 100)
  const money = (n: number) => `₹${n.toLocaleString('en-IN')}`
  return (
    <section id="pricing" className="scroll-mt-16 bg-paper py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Title kicker="Pricing" title="Simple prices. No per-bill charges." sub="Try everything free for 15 days. Pay only if you like it." />
        <div className="mb-8 flex justify-center"><span className="rounded-full bg-offer px-5 py-2 text-sm font-bold text-white shadow-md">Early Bird offer: save up to 46% today</span></div>
        <div className="grid gap-6 md:grid-cols-3">
          {plansData.map((p) => {
            const pop = p.id === 'BOTH'
            return (
              <div key={p.id} className={`relative rounded-3xl bg-white p-7 ${pop ? 'border-2 border-primary shadow-[0_30px_60px_-25px_rgb(53_86_216/0.6)]' : 'border border-line shadow-card'}`}>
                {pop && <span className="absolute -top-3.5 left-7 rounded-full bg-primary px-4 py-1 text-xs font-bold uppercase tracking-wide text-white">Best value</span>}
                <div className="text-xl font-bold">{p.name}</div>
                <div className="text-[15px] text-ink-600">{p.for}</div>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-extrabold tracking-tight">{money(p.y1.price)}</span>
                  <span className="mb-1 text-ink-600">a year</span>
                  <span className="mb-1.5 text-base text-ink-400 line-through">{money(p.y1.was)}</span>
                </div>
                <div className="mt-3 rounded-xl bg-primary-soft/60 px-4 py-3 text-[15px]">
                  <span className="font-bold">3 years: {money(p.y3.price)}</span>
                  <span className="text-ink-600"> · about {money(Math.round(p.y3.price / 3))} a year · {off(p.y3)}% off</span>
                </div>
                <div className="mt-2 text-sm text-ink-600">Taxes included</div>
                <p className="mt-3 text-[15px] text-ink-600">{p.where}</p>
                <ul className="my-6 space-y-2.5">{inc.map((x) => <li key={x} className="flex items-center gap-3 text-[15px]"><Check size={17} className="shrink-0 text-ok" strokeWidth={3} />{x}</li>)}</ul>
                <button onClick={start} className={`h-12 w-full rounded-xl text-base font-bold transition ${pop ? 'bg-primary text-white hover:bg-primary-hover' : 'border border-primary text-primary hover:bg-primary-soft'}`}>Start 15-day free trial</button>
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-center text-[15px] text-ink-600">You pay from inside the app, after your free trial. No card needed to start.</p>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5">
        <Title kicker="FAQ" title="Questions about RapidBill, answered" sub="Straight answers about billing, GST, stock, offline use and price." />
        <div className="space-y-3">
          {faqData.map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-2xl border border-line bg-white open:border-primary/40 open:bg-primary-soft/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <h3 className="text-lg font-semibold">{f.q}</h3><ChevronDown size={22} className="shrink-0 text-primary transition group-open:rotate-180" />
              </summary>
              <p className="px-6 pb-6 text-[16px] leading-relaxed text-ink-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Contact() {
  const cards = [
    { i: Phone, t: 'Call us', d: SUPPORT_PHONE_DISPLAY, a: 'Call now', href: supportTel, tone: 'bg-primary-soft text-primary' },
    { i: MessageCircle, t: 'WhatsApp', d: 'Chat with our team', a: 'Message us', href: wa('Hi RapidBill, I want to know more about your billing software.'), tone: 'bg-ok-soft text-ok' },
    { i: Clock, t: 'Free demo', d: 'We will show you how it works', a: 'Ask for a demo', href: wa('Hi RapidBill, please show me a demo.'), tone: 'bg-warn-soft text-warn' },
  ]
  return (
    <section id="contact" className="scroll-mt-16 bg-paper py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-5">
        <Title kicker="Contact" title="Talk to a real person" sub="Not sure where to start? Call or message us. We are happy to help you set up." />
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <a key={c.t} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="rounded-2xl border border-line bg-white p-7 text-center shadow-card transition hover:-translate-y-1 hover:shadow-float">
              <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${c.tone}`}><c.i size={26} /></div>
              <div className="mt-4 text-lg font-bold">{c.t}</div>
              <div className="mt-1 text-[15px] text-ink-600">{c.d}</div>
              <div className="mt-4 text-[15px] font-bold text-primary">{c.a} →</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="bg-primary py-20 text-center text-white">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-tight tracking-tight">Stop writing bills by hand.<br />Start today.</h2>
        <p className="mt-4 text-lg text-white/85">Free for 15 days. No card needed.</p>
        <div className="mt-8"><Cta light big>Start Free</Cta></div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-nav py-12 text-white/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 md:flex-row">
        <div><Logo light /><p className="mt-3 text-sm">Billing and stock software for small business in India.</p></div>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[15px]">
          {NAV.map(([l, id]) => <button key={id} onClick={() => jump(id)} className="hover:text-white">{l}</button>)}
          <button onClick={login} className="hover:text-white">Log in</button>
          <a href="/support.html" className="hover:text-white">Support</a>
          <a href="/privacy.html" className="hover:text-white">Privacy</a>
        </div>
        <div className="flex items-center gap-2 text-sm"><ShieldCheck size={16} />Your data stays yours</div>
      </div>
      <div className="mx-auto mt-8 max-w-6xl border-t border-white/10 px-5 pt-6 text-center text-sm">© {new Date().getFullYear()} RapidBill. All rights reserved.</div>
    </footer>
  )
}

export function Landing() {
  return (
    <div className="h-full overflow-y-auto scroll-smooth bg-white text-ink-900">
      <Header /><Hero /><Answer /><Proof /><Offline /><PaperVsApp /><Features /><Showcase /><How /><Pricing /><Faq /><Contact /><FinalCta /><Footer />
    </div>
  )
}
