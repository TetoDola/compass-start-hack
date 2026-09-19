import type { NewsTarget } from './briefing';

const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function phrase(text: string, name: string): boolean {
  const value = normalize(name);
  return !!value && (` ${normalize(text)} `).includes(` ${value} `);
}

export const countryAliases: Record<string, string[]> = {
  'United States': ['United States of America', 'USA', 'U.S.', 'U.S.A.'],
  'United Kingdom': ['UK', 'U.K.', 'Britain', 'British'],
  Switzerland: ['Swiss'], China: ['Chinese'], Germany: ['German'], Japan: ['Japanese'],
  France: ['French'], Taiwan: ['Taiwanese'],
  'South Korea': ['Korea, Republic of', 'Republic of Korea', 'South Korean'],
  Russia: ['Russian Federation'], Czechia: ['Czech Republic'], Netherlands: ['The Netherlands'],
};
export function countryKey(name: string): string {
  const n = normalize(name);
  return Object.entries(countryAliases).find(([key, aliases]) => [key, ...aliases].some(a => normalize(a) === n))?.[0].toLowerCase() || n;
}

// Remove security-class decorations and trailing legal suffixes, never arbitrary
// individual words. "Union Pacific" and "China Yangtze Power" stay intact.
export function companyName(name: string): string {
  return name.replace(/\s*\/US$/i, '').replace(/\s*[·,]?\s+class\s+[A-Z]$/i, '').replace(/(\b(?:Inc|Corp)\.?)\s+[A-C]$/i, '$1')
    .replace(/(?:[\s,]+(?:incorporated|corporation|corp|inc|plc|ltd|limited|ag|sa|se|nv|co|holding|holdings|group)\.?)+[\s,]*$/i, '').trim();
}
const business = /\b(shares?|stocks?|earnings|revenue|profits?|dividends?|ceo|nasdaq|nyse|guidance|investors?|antitrust|acquisition|merger|manufacturing|iphone|ipad|macbook|iphones|ai|data cloud|oil|lng)\b/i;
const macro = /\b(markets?|stocks?|bonds?|banks?|banking|economy|economic|inflation|interest rates?|central bank|tariffs?|trade|exports?|imports?|sanctions?|currency|investments?|investors?|earnings|recession|gdp|oil|gas|energy|supply|shipping|war|conflict|earthquake|floods?|outage|strike|bankruptcy|default|monetary|fiscal|debt|equities)\b/i;
const ambiguous = new Set(['apple', 'shell', 'visa', 'meta', 'alphabet', 'target', 'equatorial', 'caterpillar', 'snowflake', 'also', 'vat', 'next', 'rise']);
const industryAliases: Record<string, string[]> = {
  'Health Care': ['healthcare', 'health care', 'pharmaceutical industry'],
  'Financials': ['banking', 'banking sector', 'financial sector'],
  'Information Technology': ['technology sector', 'tech sector', 'semiconductors'],
  'Raw materials': ['raw materials', 'mining sector'],
};
const regionAliases: Record<string, string[]> = {
  'Euro area': ['eurozone', 'euro zone'],
  'Emerging markets': ['emerging economies'],
  'North America': ['North American'],
};
// Aliases refer to the same classification, never its constituent countries.
export function targetNames(target: NewsTarget): string[] {
  if (!target.kind || target.kind === 'company') return [...new Set([target.name, ...target.aliases || []].map(companyName).filter(Boolean))];
  const entry = Object.entries(countryAliases).find(([key]) => countryKey(key) === countryKey(target.name));
  const names = target.kind === 'industry' ? [target.name, ...industryAliases[target.name] || []]
    : entry ? [entry[0], ...entry[1]] : [target.name, ...regionAliases[target.name] || []];
  return [...new Set(names)];
}

export interface MatchableNews { title: string; summary?: string; tickers?: string[]; layer?: string; portfolioMatch?: 'none' }
export function matchesNewsTarget(article: MatchableNews, target: NewsTarget): boolean {
  if (article.portfolioMatch === 'none') return false;
  const text = `${article.title} ${article.summary || ''}`;
  if (!target.kind || target.kind === 'company') {
    // A quake location or vessel name cannot establish company ownership.
    if (article.layer && article.layer !== 'news') return false;
    // World Monitor tags are dictionary-extracted from source text. A tag is
    // not independent issuer verification and must never bypass text matching.
    if (target.aliases?.some(name => matchesNewsTarget(article, {...target, name, aliases: undefined}))) return true;
    const name = companyName(target.name), normalized = normalize(name);
    if (normalized.length < 2) return false;
    if (normalize(target.name) !== normalized && phrase(text, target.name)) return true;
    if (!phrase(text, name)) return false;
    // Geographic names and generic legal concepts are not issuer aliases.
    if (normalized === 'siemens' && !phrase(text.replace(/siemens\s+(?:energy|healthineers)/gi, ''), name)) return false;
    if (normalized === 'merck' && /\bco\b/i.test(target.name) && !phrase(text.replace(/merck\s+kgaa/gi, ''), name)) return false;
    if (normalized === 'equatorial' && !phrase(text.replace(/equatorial\s+guinea/gi, ''), name)) return false;
    if (normalized === 'shell' && !phrase(text.replace(/shell\s+compan(?:y|ies)/gi, ''), name)) return false;
    if (normalized === 'apple' && /\bapple\s+(?:harvest|crops?|growers?|farmers?|orchards?|fruit|juice|prices)\b/i.test(text)) return false;
    if (normalized === 'visa' && /\b(?:visa\s+(?:rules?|requirements?|applications?|restrictions?|policy|policies|holders?)|(?:travel|tourist|student|immigration|work)\s+visas?)\b/i.test(text)) return false;
    if (normalized.length <= 3) {
      // Acronyms such as ABB, SAP and BP must retain their source casing.
      if (!new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(name.toUpperCase())}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text)) return false;
      return business.test(text);
    }
    if (ambiguous.has(normalized)) {
      // Require business context near the actual mention, not anywhere in a
      // long provider summary about an unrelated company.
      const plain = normalize(text), at = plain.indexOf(normalized);
      return business.test(plain.slice(Math.max(0, at - 70), at + normalized.length + 100));
    }
    return true;
  }
  if (target.kind === 'country' || target.kind === 'region') {
    // Match geography and the economic topic in the headline itself. A
    // provider's boilerplate/related-story summary is not evidence of relevance.
    if (!macro.test(article.title)) return false;
    return targetNames(target).some(name => {
      if (/^[A-Z.]{2,5}$/.test(name)) return new RegExp(`(?:^|[^A-Za-z])${escape(name)}(?=$|[^A-Za-z])`).test(article.title);
      return phrase(article.title, name);
    });
  }
  return targetNames(target).some(name => phrase(article.title, name));
}
