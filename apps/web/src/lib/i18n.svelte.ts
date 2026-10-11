import { createI18n, negotiateLocale, PSEUDO, type Catalog, type I18n, type Values } from '@sp/i18n';
import cs from '@sp/i18n/locales/cs.json';
import en from '@sp/i18n/locales/en.json';
import { settings } from './settings.svelte';

export const LOCALES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'cs', name: 'Čeština' },
  { code: PSEUDO, name: 'Pseudo (QA)' },
];

const CATALOGS: Record<string, Catalog> = { en, cs };

/** String values with these prefixes are themselves message keys (unit names, sides, weapons). */
const NESTED = /^(unit|side|weapon|scenario)\./;

class LocaleStore {
  i18n = $state<I18n>(null!);
  private extra: Record<string, Catalog> = {};

  constructor() {
    const initial = settings.locale ?? negotiateLocale(navigator.languages ?? [], ['en', 'cs']);
    this.set(initial);
  }

  set(code: string): void {
    const i = createI18n(code, CATALOGS[code] ?? {}, en);
    i.extend(this.extra.en ?? {});
    if (code !== 'en') i.extend(this.extra[code] ?? {});
    this.i18n = i;
    settings.locale = code;
    document.documentElement.lang = code === PSEUDO ? 'en' : code;
    document.documentElement.dir = i.dir;
  }

  /** Register per-scenario strings for all locales. */
  addStrings(strings: Record<string, Catalog>): void {
    for (const [loc, cat] of Object.entries(strings)) this.extra[loc] = { ...this.extra[loc], ...cat };
    this.set(this.i18n.locale);
  }

  t = (key: string, values?: Values): string => {
    if (!values) return this.i18n.t(key);
    const resolved: Values = {};
    for (const [k, v] of Object.entries(values)) resolved[k] = typeof v === 'string' && NESTED.test(v) ? this.i18n.t(v) : v;
    return this.i18n.t(key, resolved);
  };
}

export const locale = new LocaleStore();
export const t = (key: string, values?: Values) => locale.t(key, values);
