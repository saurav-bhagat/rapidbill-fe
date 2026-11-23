import { describe, expect, it } from 'vitest'
import { exampleReward, initialsOf, whatsappShareUrl } from './share'

describe('sharing', () => {
  it('builds a WhatsApp link that carries the whole message, safely encoded', () => {
    const text = 'Try RapidBill with my code RB-7K4M2Q: https://therapidbill.in/signup?ref=RB-7K4M2Q & get 15 days free'
    const url = whatsappShareUrl(text)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(text)
    expect(url).not.toContain(' ')
    expect(url.split('?').length).toBe(2) // the message's own ? and & are encoded, not extra parts
  })
  it('works for Hindi text', () => {
    const text = 'नमस्ते! मेरे कोड RB-7K4M2Q से 15 दिन मुफ़्त आज़माएँ'
    expect(decodeURIComponent(whatsappShareUrl(text).slice('https://wa.me/?text='.length))).toBe(text)
  })
})

describe('example reward', () => {
  it('is 10% of the plan fee without GST, rounded down, like the server', () => {
    expect(exampleReward(159900, 10)).toBe(13550)
    expect(exampleReward(339900, 10)).toBe(28805)
    expect(exampleReward(79900, 10)).toBe(6771)
    expect(exampleReward(0, 10)).toBe(0)
  })
})

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initialsOf('Ravi Kumar')).toBe('RK')
    expect(initialsOf('  meena  ')).toBe('M')
    expect(initialsOf('Anil Kumar Singh')).toBe('AS')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('राम शर्मा')).toBe('रश')
  })
})
