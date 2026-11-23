import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Search and answer engines (Google, ChatGPT, Perplexity, Claude and others) often read the raw HTML without running JavaScript.
 * This puts the questions and answers, the business facts and the prices into index.html itself, as structured data
 * (JSON-LD) and as plain text for crawlers. The questions and plans come from the same files the landing page uses,
 * so the page and the structured data cannot disagree.
 */
const SITE = 'https://therapidbill.in'
const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../src/landing/${f}`, import.meta.url), 'utf8')) as T
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`

interface Faq { q: string; a: string }
interface Plan { id: string; name: string; y1: { price: number }; y3: { price: number } }

export function seoHtml(): Plugin {
  return {
    name: 'rapidbill-seo-html',
    transformIndexHtml(html) {
      const faq = read<Faq[]>('faq.json')
      const plans = read<Plan[]>('plans.json')
      const prices = plans.flatMap((p) => [p.y1.price, p.y3.price])
      const head = [
        ld({
          '@context': 'https://schema.org', '@type': 'Organization', name: 'RapidBill', url: SITE, logo: `${SITE}/icons/icon-512.png`,
          contactPoint: { '@type': 'ContactPoint', telephone: '+91-87893-30638', contactType: 'customer support', areaServed: 'IN', availableLanguage: ['English', 'Hindi'] },
        }),
        ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'RapidBill', url: SITE, inLanguage: 'en-IN' }),
        ld({
          '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'RapidBill', url: SITE,
          applicationCategory: 'BusinessApplication', operatingSystem: 'Web, iOS, Android',
          description: 'RapidBill is the easiest GST billing and stock software for small businesses and shops in India. Make GST bills in seconds, track stock, and keep billing offline.',
          offers: {
            '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length,
            offers: plans.flatMap((p) => [[p.y1.price, '1 year'], [p.y3.price, '3 years']].map(([price, term]) => ({ '@type': 'Offer', name: `${p.name}, ${term}`, price, priceCurrency: 'INR' }))),
          },
          featureList: ['GST invoices with CGST, SGST and IGST', 'Works offline and syncs automatically', 'Stock updates with every bill', 'Mobile app and web app', 'Bills in English and Hindi', 'Import from Excel or CSV', 'Several businesses in one account'],
        }),
        ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }),
      ].join('\n    ')
      const body = `<noscript>
      <h1>RapidBill: the easiest and best billing software for small business and shops in India</h1>
      <p>RapidBill is GST billing and stock software for shopkeepers, traders and small businesses. Make GST bills in seconds, keep track of stock, bill from your phone or computer, and keep working when the internet is down. Free for 15 days, no card needed.</p>
      <h2>Frequently asked questions</h2>
      ${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n      ')}
      <p><a href="/privacy.html">Privacy Policy</a> · <a href="/support.html">Support</a> · Call or WhatsApp +91 87893 30638</p>
    </noscript>`
      return html.replace('<!--seo-head-->', head).replace('<!--seo-body-->', body)
    },
  }
}
