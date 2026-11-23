// Tests for the question pipeline's safety checks. No network calls, no cost.
import { describe, it, expect } from 'vitest'
import { cleanMarkdown, validate } from './generateQuestions'

const SOURCE =
  'Photosynthesis was discovered in 1779 by Jan Ingenhousz who showed that plants need light, not just soil and water. ' +
  'In the light-independent reactions, the enzyme RuBisCO captures CO2 from the atmosphere.'

const good = {
  question: 'Which enzyme captures CO2 in the light-independent reactions?',
  correctAnswer: 'RuBisCO',
  wrongAnswers: ['ATP synthase', 'Pheophytin', 'Plastocyanin'],
  sourceQuote: 'the enzyme RuBisCO captures CO2 from the atmosphere',
  explanation: 'The source names RuBisCO.',
}

describe('cleanMarkdown', () => {
  it('turns links into plain words and removes images and citations', () => {
    const md = 'Plants use [chlorophyll](https://x.org/wiki/Chlorophyll "Chlorophyll")[\\[2\\]](https://x.org#c2) ![](https://img.png) daily.'
    expect(cleanMarkdown(md)).toBe('Plants use chlorophyll daily.')
  })

  it('handles links whose URL contains parentheses', () => {
    expect(cleanMarkdown('See [this](https://x.org/wiki/Photo_(disambiguation) "Photo") page.')).toBe('See this page.')
  })

  it('cuts everything from the References section onward', () => {
    const out = cleanMarkdown('Main text here.\n\n## References\n\n1. Some citation')
    expect(out).toBe('Main text here.')
  })
})

describe('validate', () => {
  it('keeps a good question and marks the correct answer, wherever it lands', () => {
    for (let run = 0; run < 20; run++) {
      const { good: kept } = validate({ questions: [good] }, SOURCE)
      expect(kept).toHaveLength(1)
      expect(kept[0].choices).toHaveLength(4)
      expect(kept[0].choices[kept[0].answerIndex]).toBe('RuBisCO')
    }
  })

  it('drops a question whose quote is not really in the source (made up)', () => {
    const fake = { ...good, sourceQuote: 'RuBisCO is the most delicious enzyme in the world' }
    const result = validate({ questions: [fake] }, SOURCE)
    expect(result.good).toHaveLength(0)
    expect(result.dropped).toBe(1)
  })

  it('drops a question whose quote does not support the answer', () => {
    const mismatch = { ...good, correctAnswer: 'ATP synthase', wrongAnswers: ['RuBisCO', 'Pheophytin', 'Plastocyanin'] }
    expect(validate({ questions: [mismatch] }, SOURCE).good).toHaveLength(0)
  })

  it('drops a question with duplicate choices', () => {
    const dupes = { ...good, wrongAnswers: ['RuBisCO', 'Pheophytin', 'Plastocyanin'] }
    expect(validate({ questions: [dupes] }, SOURCE).good).toHaveLength(0)
  })

  it('drops a question with the wrong number of wrong answers', () => {
    const short = { ...good, wrongAnswers: ['ATP synthase'] }
    expect(validate({ questions: [short] }, SOURCE).good).toHaveLength(0)
  })

  it('returns nothing for garbage model output', () => {
    expect(validate(null, SOURCE).good).toHaveLength(0)
    expect(validate({ nope: true }, SOURCE).good).toHaveLength(0)
  })
})
