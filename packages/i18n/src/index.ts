import { IntlMessageFormat } from 'intl-messageformat';

export type Catalog = Record<string, string>;
export type Values = Record<string, string | number | boolean | Date>;

export const PSEUDO = 'en-XA';
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export interface I18n {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  t(key: string, values?: Values): string;
  has(key: string): boolean;
  /** Merge extra strings (e.g. from a scenario) without replacing the base catalog. */
  extend(catalog: Catalog): void;
  number(n: number, opts?: Intl.NumberFormatOptions): string;
}

/**
 * `fallback` (English) fills any key missing from `catalog`, so a partial translation never shows raw keys.
 * Missing keys in both are returned as `⟦key⟧` so tests and QA can spot them.
 */
export function createI18n(locale: string, catalog: Catalog, fallback: Catalog = {}): I18n {
  const formatLocale = locale === PSEUDO ? 'en' : locale;
  const messages: Catalog = { ...fallback, ...(locale === PSEUDO ? pseudoCatalog(fallback) : catalog) };
  const cache = new Map<string, IntlMessageFormat>();
  return {
    locale,
    dir: RTL.has(locale.split('-')[0]!) ? 'rtl' : 'ltr',
    t(key, values) {
      const msg = messages[key];
      if (msg === undefined) return `⟦${key}⟧`;
      let fmt = cache.get(key);
      if (!fmt) {
        fmt = new IntlMessageFormat(msg, formatLocale);
        cache.set(key, fmt);
      }
      return String(fmt.format(values));
    },
    has: (key) => key in messages,
    extend(extra) {
      Object.assign(messages, locale === PSEUDO ? pseudoCatalog(extra) : extra);
      for (const k of Object.keys(extra)) cache.delete(k);
    },
    number: (n, opts) => new Intl.NumberFormat(formatLocale, opts).format(n),
  };
}

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', z: 'ž',
  A: 'Å', E: 'É', I: 'Î', O: 'Ø', U: 'Û', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ý', Z: 'Ž',
};

/** Accents letters outside ICU placeholders and pads by ~40% to expose truncation. */
export function pseudoLocalize(msg: string): string {
  let depth = 0;
  let out = '';
  for (const ch of msg) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    out += depth === 0 ? (ACCENTS[ch] ?? ch) : ch;
  }
  const pad = '~'.repeat(Math.ceil(msg.length * 0.4));
  return `[${out}${pad}]`;
}

function pseudoCatalog(c: Catalog): Catalog {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, pseudoLocalize(v)]));
}

/** Choose the best supported locale from the browser's preferences. */
export function negotiateLocale(preferred: readonly string[], supported: readonly string[], fallback = 'en'): string {
  for (const p of preferred) {
    if (supported.includes(p)) return p;
    const base = p.split('-')[0]!;
    if (supported.includes(base)) return base;
  }
  return fallback;
}
