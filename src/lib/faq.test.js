/**
 * Unit tests for src/lib/faq.js.
 *
 * The regression these exist for: one FAQ row whose answer was still the
 * template's "TODO — réponse complète" was published, and it rendered on seven
 * public pages and inside the FAQPage structured data Google indexes.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { isAnswered, isPlaceholder, publishable } from './faq.js';

describe('isPlaceholder', () => {
  test('catches the template markers the inputs file ships with', () => {
    for (const v of ['TODO', 'TODO — réponse complète', 'todo', '  TBD ', 'FIXME', 'XXXX', 'À compléter', 'Lorem ipsum dolor']) {
      assert.equal(isPlaceholder(v), true, `${v} must be treated as unwritten`);
    }
  });

  test('treats missing and empty as unwritten', () => {
    for (const v of [null, undefined, '', '   ']) assert.equal(isPlaceholder(v), true);
  });

  /* The false positive a naive /todo/i match produced: it flagged the Spanish
     homepage and fleet page, whose copy is correct. */
  test('does NOT flag real copy that merely contains the letters', () => {
    assert.equal(isPlaceholder('Precios todo incluido en dírhams'), false);
    assert.equal(isPlaceholder('Un permis de conduire de plus d’un an.'), false);
  });
});

describe('isAnswered', () => {
  const good = {
    question: { fr: 'Quels documents ?', en: 'Which documents?' },
    shortAnswer: { fr: 'Permis, pièce d’identité, carte bancaire.', en: 'Licence, ID, bank card.' },
    longAnswer: { fr: 'Le permis doit avoir plus d’un an.', en: 'The licence must be over a year old.' },
  };

  test('a finished row is publishable', () => {
    assert.equal(isAnswered(good), true);
  });

  /* Exactly the row that was live on 2026-09-10. */
  test('the row that leaked is refused', () => {
    assert.equal(
      isAnswered({
        question: { fr: 'Quels documents faut-il pour louer une voiture ?' },
        shortAnswer: { fr: 'TODO — réponse factuelle en 1–2 phrases' },
        longAnswer: { fr: 'TODO — réponse complète' },
      }),
      false,
    );
  });

  test('a placeholder in ANY language disqualifies the row', () => {
    assert.equal(isAnswered({ ...good, shortAnswer: { ...good.shortAnswer, ar: 'TODO' } }), false);
    assert.equal(isAnswered({ ...good, longAnswer: { ...good.longAnswer, es: 'TBD' } }), false);
  });

  test('a question with no short answer is refused', () => {
    assert.equal(isAnswered({ question: { fr: 'Une question ?' } }), false);
    assert.equal(isAnswered({ question: { fr: 'Une question ?' }, shortAnswer: { fr: '' } }), false);
  });

  test('reads the snake_case shape Postgres returns as well as camelCase', () => {
    assert.equal(isAnswered({ question: { fr: 'Q ?' }, short_answer: { fr: 'A.' } }), true);
    assert.equal(isAnswered({ question: { fr: 'Q ?' }, short_answer: { fr: 'TODO' } }), false);
  });

  test('a long answer is optional', () => {
    assert.equal(isAnswered({ question: { fr: 'Q ?' }, shortAnswer: { fr: 'A.' } }), true);
  });

  test('nothing at all is refused rather than throwing', () => {
    assert.equal(isAnswered(null), false);
    assert.equal(isAnswered({}), false);
  });

  /* The demo seed's rows carry only the legacy `answer` bag. Requiring a short
     answer outright hid every one of them, so demo mode had no FAQ (rule 12). */
  test('a demo row that answers only through the legacy answer bag is publishable', () => {
    const demo = { question: { fr: 'Quel âge ?', en: 'What age?' }, answer: { fr: '21 ans.', en: '21.' } };
    assert.equal(isAnswered(demo), true);
    assert.equal(publishable([demo]).length, 1);
  });

  test('a legacy answer bag is still held to the placeholder rule', () => {
    assert.equal(isAnswered({ question: { fr: 'Q ?' }, answer: { fr: 'TODO — réponse complète' } }), false);
    assert.equal(isAnswered({ question: { fr: 'Q ?' }, shortAnswer: { fr: 'Oui.' }, answer: { es: 'TBD' } }), false);
  });
});

describe('publishable', () => {
  test('keeps the finished rows and drops the rest', () => {
    const rows = [
      { question: { fr: 'A ?' }, shortAnswer: { fr: 'Oui.' } },
      { question: { fr: 'B ?' }, shortAnswer: { fr: 'TODO' } },
      { question: { fr: 'C ?' }, shortAnswer: { fr: 'Non.' } },
    ];
    assert.deepEqual(publishable(rows).map((r) => r.question.fr), ['A ?', 'C ?']);
  });

  test('an empty or missing list is safe', () => {
    assert.deepEqual(publishable([]), []);
    assert.deepEqual(publishable(), []);
  });
});
