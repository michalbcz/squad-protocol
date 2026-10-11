import { describe, expect, it } from 'vitest';
import { createI18n, negotiateLocale, PSEUDO } from '../src';
import cs from '../locales/cs.json';
import en from '../locales/en.json';

const VALUES = { count: 2, ap: 1, cost: 1, chance: 50, name: 'x', side: 'x', turn: 1, key: 'x', hp: 1, amount: 3, days: 3, step: 1, confirm: 'Enter', endTurn: 'E', snap: '1', aimed: '2' };

describe('i18n', () => {
  it('formats plurals per locale', () => {
    const t = createI18n('cs', { n: '{count, plural, one {# bod} few {# body} other {# bodů}}' });
    expect(t.t('n', { count: 1 })).toBe('1 bod');
    expect(t.t('n', { count: 3 })).toBe('3 body');
    expect(t.t('n', { count: 5 })).toBe('5 bodů');
  });
  it('falls back to English and flags missing keys', () => {
    const t = createI18n('cs', {}, { hello: 'Hello' });
    expect(t.t('hello')).toBe('Hello');
    expect(t.t('nope')).toBe('⟦nope⟧');
  });
  it('pseudo-locale keeps ICU placeholders working', () => {
    const t = createI18n(PSEUDO, {}, { ap: '{ap} AP left' });
    expect(t.t('ap', { ap: 12 })).toMatch(/^\[12 ÅP léft~+\]$/);
  });
  it('negotiates locales', () => {
    expect(negotiateLocale(['cs-CZ', 'en'], ['en', 'cs'])).toBe('cs');
    expect(negotiateLocale(['de'], ['en', 'cs'])).toBe('en');
  });
  it('Czech catalog covers every English key and every message parses', () => {
    const missing = Object.keys(en).filter((k) => !(k in cs));
    expect(missing).toEqual([]);
    for (const [lang, cat] of [['en', en], ['cs', cs]] as const) {
      const t = createI18n(lang, cat);
      for (const k of Object.keys(cat)) expect(() => t.t(k, VALUES), k).not.toThrow();
    }
  });
});
