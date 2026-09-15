/**
 * answerFor() / shortAnswerFor(): the single source of the FAQ text a reader
 * sees AND the text the FAQPage structured data carries.
 *
 * The regression they exist for: the long answers are French-only, the site's
 * general picker falls back to French for a missing language, and the
 * accordion rendered French paragraphs on the English, Arabic and Spanish pages.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { answerFor, shortAnswerFor } from './faq.js';

const row = {
  question: { fr: 'Q fr', en: 'Q en', ar: 'Q ar', es: 'Q es' },
  shortAnswer: { fr: 'Short fr.', en: 'Short en.', ar: 'Short ar.', es: 'Short es.' },
  longAnswer: { fr: 'Long fr.' },
};

describe('answerFor', () => {
  test('French gets the long answer, which exists in French', () => {
    assert.equal(answerFor(row, 'fr'), 'Long fr.');
  });

  test('English, Arabic and Spanish get their OWN short answer, never the French long one', () => {
    assert.equal(answerFor(row, 'en'), 'Short en.');
    assert.equal(answerFor(row, 'ar'), 'Short ar.');
    assert.equal(answerFor(row, 'es'), 'Short es.');
  });

  test('a long answer that exists in the locale is preferred over the short one', () => {
    const both = { ...row, longAnswer: { fr: 'Long fr.', en: 'Long en.' } };
    assert.equal(answerFor(both, 'en'), 'Long en.');
  });

  test('reads the snake_case shape a raw Postgres row has', () => {
    const raw = { short_answer: { en: 'Short en.' }, long_answer: { fr: 'Long fr.' } };
    assert.equal(answerFor(raw, 'en'), 'Short en.');
    assert.equal(answerFor(raw, 'fr'), 'Long fr.');
  });

  test('a seeded row, whose legacy answer bag mirrors the French long answer, still gives English its short answer', () => {
    const seeded = { ...row, answer: { fr: 'Long fr.' } };
    assert.equal(answerFor(seeded, 'en'), 'Short en.');
  });

  test('a demo row with only the legacy answer bag still renders in its own language', () => {
    const demo = { answer: { fr: 'A fr.', en: 'A en.', ar: 'A ar.', es: 'A es.' } };
    assert.equal(answerFor(demo, 'ar'), 'A ar.');
  });

  test('the legacy bag keeps its French fallback, exactly as the site always did', () => {
    assert.equal(answerFor({ answer: { fr: 'A fr.' } }, 'es'), 'A fr.');
    assert.equal(answerFor({ answer: 'Plain.' }, 'en'), 'Plain.');
  });

  test('a row answered in French only still answers on the English page, rather than an empty panel', () => {
    assert.equal(answerFor({ shortAnswer: { fr: 'Court.' } }, 'en'), 'Court.');
    assert.equal(answerFor({ shortAnswer: {}, longAnswer: { fr: 'Long.' }, answer: {} }, 'ar'), 'Long.');
  });

  test('whitespace-only text does not count as an answer', () => {
    assert.equal(answerFor({ longAnswer: { en: '   ' }, shortAnswer: { en: 'Short en.' } }, 'en'), 'Short en.');
  });

  test('nothing to show is an empty string, not a crash', () => {
    assert.equal(answerFor(null, 'fr'), '');
    assert.equal(answerFor({}, 'fr'), '');
  });
});

describe('shortAnswerFor', () => {
  test('the short answer in the locale, even where a long one exists (the vehicle page lists short answers)', () => {
    assert.equal(shortAnswerFor(row, 'fr'), 'Short fr.');
    assert.equal(shortAnswerFor(row, 'ar'), 'Short ar.');
  });

  test('no short answer in the locale falls through to answerFor', () => {
    assert.equal(shortAnswerFor({ shortAnswer: { fr: 'Short fr.' }, longAnswer: { en: 'Long en.' } }, 'en'), 'Long en.');
    assert.equal(shortAnswerFor({ shortAnswer: { fr: 'Short fr.' } }, 'es'), 'Short fr.');
  });

  test('reads the snake_case row, and survives null', () => {
    assert.equal(shortAnswerFor({ short_answer: { es: 'Corta.' } }, 'es'), 'Corta.');
    assert.equal(shortAnswerFor(null, 'fr'), '');
  });
});
