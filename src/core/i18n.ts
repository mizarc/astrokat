import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path: src/core/i18n.ts -> ../../locales/
const LOCALES_DIR = resolve(__dirname, '..', '..', 'locales');

type NestedLocale = string | { [key: string]: NestedLocale };

let localeData: Record<string, NestedLocale> = {};
let loadedLang = '';

/**
 * Load a locale file by language code (e.g. 'en').
 * Falls back to 'en' if the requested file cannot be found.
 */
export function loadLocale(lang: string = 'en'): void {
  const filePath = resolve(LOCALES_DIR, `${lang}.json`);
  try {
    const content = readFileSync(filePath, 'utf-8');
    localeData = JSON.parse(content);
    loadedLang = lang;
  } catch {
    if (lang !== 'en') {
      // Fall back to English
      loadLocale('en');
    } else {
      localeData = {};
      loadedLang = '';
    }
  }
}

/**
 * Retrieve a localized string by dot-separated key.
 * Supports dynamic parameter substitution using {paramName} syntax.
 *
 * @example
 *   t('ping.result', { latency: 42 })
 *   // → "🏓 Pong! Bot latency is: **42ms**"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  if (!loadedLang) {
    loadLocale('en');
  }

  const keys = key.split('.');
  let value: NestedLocale | undefined = localeData;

  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = (value as Record<string, NestedLocale>)[k];
    } else {
      value = undefined;
      break;
    }
  }

  if (typeof value !== 'string') {
    console.warn(`[i18n] Missing translation key: ${key}`);
    return key;
  }

  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, p: string) =>
      String(params[p] ?? `{${p}}`),
    );
  }

  return value;
}

// Auto-load English on import
loadLocale('en');
