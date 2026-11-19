import type { Paise } from './money'

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n: number): string {
  if (n < 20) return ones[n]
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
}

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  return [h ? `${ones[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ')
}

/** Indian system: Crore, Lakh, Thousand, Hundred. */
export function numberToWordsIN(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${numberToWordsIN(crore)} Crore`)
  if (lakh) parts.push(`${below100(lakh)} Lakh`)
  if (thousand) parts.push(`${below100(thousand)} Thousand`)
  if (rest) parts.push(below1000(rest))
  return parts.join(' ')
}

const HI_UNDER_100 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
]

/** Same Indian grouping in Hindi: करोड़, लाख, हज़ार, सौ. Hindi has an irregular word for every number to 99. */
export function numberToWordsHI(n: number): string {
  if (n === 0) return HI_UNDER_100[0]
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const hundred = Math.floor((n % 1000) / 100)
  const rest = n % 100
  if (crore) parts.push(`${numberToWordsHI(crore)} करोड़`)
  if (lakh) parts.push(`${HI_UNDER_100[lakh]} लाख`)
  if (thousand) parts.push(`${HI_UNDER_100[thousand]} हज़ार`)
  if (hundred) parts.push(`${HI_UNDER_100[hundred]} सौ`)
  if (rest) parts.push(HI_UNDER_100[rest])
  return parts.join(' ')
}

/**
 * 12345650 paise -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"
 * With lang 'hi': "एक लाख तेईस हज़ार चार सौ छप्पन रुपये और पचास पैसे मात्र".
 */
export function amountInWords(paise: Paise, lang: 'en' | 'hi' = 'en'): string {
  const abs = Math.abs(Math.round(paise))
  const rupees = Math.floor(abs / 100)
  const ps = abs % 100
  if (lang === 'hi') {
    let hi = `${numberToWordsHI(rupees)} रुपये`
    if (ps) hi += ` और ${numberToWordsHI(ps)} पैसे`
    return `${paise < 0 ? 'ऋण ' : ''}${hi} मात्र`
  }
  let out = `Rupees ${numberToWordsIN(rupees)}`
  if (ps) out += ` and ${numberToWordsIN(ps)} Paise`
  return `${paise < 0 ? 'Minus ' : ''}${out} Only`
}
