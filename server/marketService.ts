// Real Financial Market Data & Multi-Source News Engine with Dynamic News-Sentiment Adaptation
// Connects directly to Yahoo Finance and Real Multi-Source Financial RSS Feeds
import { analyzeArticleWithAI, synthesizeAssetNewsAI } from './newsAiEngine';

export const SYMBOL_MAP: Record<string, string> = {
  // FX Majör & Kur
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'JPY=X',
  'USD/CHF': 'CHF=X',
  'USD/CAD': 'CAD=X',
  'AUD/USD': 'AUDUSD=X',
  'NZD/USD': 'NZDUSD=X',
  'USD/TRY': 'USDTRY=X',
  'EUR/TRY': 'EURTRY=X',

  // Değerli Metaller & Emtia
  'XAU/USD': 'GC=F',
  'XAG/USD': 'SI=F',
  'COPPER': 'HG=F',
  'BRENT': 'BZ=F',
  'WTI': 'CL=F',
  'NATGAS': 'NG=F',

  // Endeksler & Makro Göstergeler
  'NAS100': 'NQ=F',
  'SPX500': 'ES=F',
  'US30': 'YM=F',
  'VIX': '^VIX',
  'US10Y': '^TNX',

  // ABD Teknoloji & Lider Hisseler
  'NVDA': 'NVDA',
  'AAPL': 'AAPL',
  'MSFT': 'MSFT',
  'GOOGL': 'GOOGL',
  'AMZN': 'AMZN',
  'META': 'META',
  'AMD': 'AMD',
  'TSLA': 'TSLA',

  // Kripto Varlıklar
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
  'SOL/USD': 'SOL-USD',
  'BNB/USD': 'BNB-USD',
  'XRP/USD': 'XRP-USD',
  'AVAX/USD': 'AVAX-USD',
  'LINK/USD': 'LINK-USD',
  'DOGE/USD': 'DOGE-USD',
  'ADA/USD': 'ADA-USD',
};

// In-Memory OHLC & Hourly History Cache + In-Flight Deduplication (20s OHLC + 2.5s Real-Time Orderbook Tick Overlay)
const OHLC_CACHE_TTL = 20 * 1000;
const ohlcCache = new Map<string, { timestamp: number; data: any }>();
const inFlightOhlc = new Map<string, Promise<any>>();
export interface HourlyBar {
  timestamp: number;
  endTimestamp?: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  vwap?: number;
}

const US_EQUITY_SYMBOLS_SET = new Set([
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AMD', 'TSLA',
]);

export type SessionMode = 'CRYPTO_UTC' | 'NY_CLOSE_17ET' | 'US_EQUITY_RTH';

const nyPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function getNyUtcOffsetHours(tsMs: number): number {
  try {
    const parts = Object.fromEntries(nyPartsFormatter.formatToParts(tsMs).map((p) => [p.type, p.value]));
    const hr = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hr, Number(parts.minute));
    const diffHrs = Math.round((asUtc - Math.floor(tsMs / 60000) * 60000) / 3600000);
    return diffHrs >= -6 && diffHrs <= -3 ? diffHrs : -5;
  } catch {
    return -5;
  }
}

export function getNyLocalTimeInfo(tsMs: number): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  minutesOfDay: number;
  offsetHours: number;
} {
  const parts = Object.fromEntries(nyPartsFormatter.formatToParts(tsMs).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const rawOff = Math.round((asUtc - Math.floor(tsMs / 60000) * 60000) / 3600000);
  const offsetHours = rawOff >= -6 && rawOff <= -3 ? rawOff : -5;
  return { year, month, day, dayOfWeek, hour, minute, minutesOfDay: hour * 60 + minute, offsetHours };
}

export function getSessionMode(symbol: string): SessionMode {
  if (KRAKEN_PAIR_MAP[symbol]) return 'CRYPTO_UTC';
  if (US_EQUITY_SYMBOLS_SET.has(symbol)) return 'US_EQUITY_RTH';
  return 'NY_CLOSE_17ET';
}

// Meeus/Jones/Butcher Gregoryen Paskalya algoritması üzerinden Kutsal Cuma (Good Friday) hesabı
function computeGoodFridayMonthDay(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const gfUtc = new Date(Date.UTC(year, easterMonth - 1, easterDay - 2));
  return { month: gfUtc.getUTCMonth() + 1, day: gfUtc.getUTCDate() };
}

export interface UsExchangeHolidayInfo {
  isNyseFullHoliday: boolean;
  isNyseEarlyClose13ET: boolean;
  isCmeFullHoliday: boolean;
  isCmeEarlyHalt13ET: boolean;
  holidayNameTR?: string;
}

// Resmi NYSE / NASDAQ & CME Vadeli Tatil ve Erken Kapanış Takvimi (Tüm Yıllar İçin Otomatik)
export function getUsExchangeHolidayInfo(tsMs: number): UsExchangeHolidayInfo {
  const ny = getNyLocalTimeInfo(tsMs);
  const { year, month, day, dayOfWeek } = ny;

  // 1) Yılbaşı (1 Ocak; Pazar'a denk gelirse 2 Ocak Pazartesi resmi tatil)
  if ((month === 1 && day === 1 && dayOfWeek !== 0) || (month === 1 && day === 2 && dayOfWeek === 1)) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: true,
      isCmeEarlyHalt13ET: false,
      holidayNameTR: 'Yılbaşı Resmi Borsa Tatili',
    };
  }

  // 2) Martin Luther King Jr. Günü (Ocak ayının 3. Pazartesi günü)
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD MLK Günü Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }

  // 3) Başkanlar Günü — Presidents' Day (Şubat ayının 3. Pazartesi günü)
  if (month === 2 && dayOfWeek === 1 && day >= 15 && day <= 21) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD Başkanlar Günü Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }

  // 4) Kutsal Cuma — Good Friday (NYSE & CME Tam Gün Kapalı)
  const gf = computeGoodFridayMonthDay(year);
  if (month === gf.month && day === gf.day) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: true,
      isCmeEarlyHalt13ET: false,
      holidayNameTR: 'Kutsal Cuma (NYSE & CME Kapalı)',
    };
  }

  // 5) Anma Günü — Memorial Day (Mayıs ayının son Pazartesi günü)
  if (month === 5 && dayOfWeek === 1 && day >= 25) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD Anma Günü Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }

  // 6) Juneteenth (19 Haziran; Cumartesi ise 18 Cuma, Pazar ise 20 Pazartesi)
  if (
    (month === 6 && day === 19 && dayOfWeek >= 1 && dayOfWeek <= 5) ||
    (month === 6 && day === 18 && dayOfWeek === 5) ||
    (month === 6 && day === 20 && dayOfWeek === 1)
  ) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD Juneteenth Resmi Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }

  // 7) ABD Bağımsızlık Günü — 4 Temmuz (+ 3 Temmuz Erken Kapanış)
  if (
    (month === 7 && day === 4 && dayOfWeek >= 1 && dayOfWeek <= 5) ||
    (month === 7 && day === 3 && dayOfWeek === 5) ||
    (month === 7 && day === 5 && dayOfWeek === 1)
  ) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD 4 Temmuz Bağımsızlık Günü Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }
  if (month === 7 && day === 3 && dayOfWeek >= 1 && dayOfWeek <= 4) {
    return {
      isNyseFullHoliday: false,
      isNyseEarlyClose13ET: true,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: false,
      holidayNameTR: 'ABD Bağımsızlık Günü Arifesi (13:00 ET Erken Kapanış)',
    };
  }

  // 8) İşçi Bayramı — Labor Day (Eylül ayının ilk Pazartesi günü)
  if (month === 9 && dayOfWeek === 1 && day <= 7) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD İşçi Bayramı Tatili (NYSE Kapalı / CME 13:00 ET Mola)',
    };
  }

  // 9) Şükran Günü — Thanksgiving Day (Kasım ayının 4. Perşembe günü) & Ertesi Cuma Erken Kapanış
  if (month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'ABD Şükran Günü (Thanksgiving — NYSE Kapalı / CME 13:00 ET Tatil Molası)',
    };
  }
  if (month === 11 && dayOfWeek === 5 && day >= 23 && day <= 29) {
    return {
      isNyseFullHoliday: false,
      isNyseEarlyClose13ET: true,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'Şükran Günü Ertesi (13:00 ET Erken Kapanış)',
    };
  }

  // 10) Noel — Christmas (25 Aralık; Cumartesi ise 24 Cuma, Pazar ise 26 Pazartesi + 24 Aralık Erken Kapanış)
  if (
    (month === 12 && day === 25 && dayOfWeek >= 1 && dayOfWeek <= 5) ||
    (month === 12 && day === 24 && dayOfWeek === 5) ||
    (month === 12 && day === 26 && dayOfWeek === 1)
  ) {
    return {
      isNyseFullHoliday: true,
      isNyseEarlyClose13ET: false,
      isCmeFullHoliday: true,
      isCmeEarlyHalt13ET: false,
      holidayNameTR: 'Noel Resmi Borsa Tatili (NYSE & CME Kapalı)',
    };
  }
  if (month === 12 && day === 24 && dayOfWeek >= 1 && dayOfWeek <= 4) {
    return {
      isNyseFullHoliday: false,
      isNyseEarlyClose13ET: true,
      isCmeFullHoliday: false,
      isCmeEarlyHalt13ET: true,
      holidayNameTR: 'Noel Arifesi (13:00 ET Erken Kapanış)',
    };
  }

  return {
    isNyseFullHoliday: false,
    isNyseEarlyClose13ET: false,
    isCmeFullHoliday: false,
    isCmeEarlyHalt13ET: false,
  };
}

// Canlı Veri Tazeliği & Donmuş Tahta Denetçisi (Tatil molası, CME bakım arası ve veri kesintisini anında yakalar!)
export function isAssetFeedLiveAndFresh(
  symbol: string,
  h1Bars: HourlyBar[] | undefined,
  nowMs = Date.now()
): { fresh: boolean; reason?: string } {
  if (!h1Bars || h1Bars.length < 5) {
    return { fresh: false, reason: 'Yetersiz saatlik bar verisi' };
  }
  const lastBar = h1Bars[h1Bars.length - 1];
  const ageMs = nowMs - lastBar.timestamp;

  // 7/24 Kripto piyasasında 3 saatten eski son mum veri kopukluğu demektir
  if (KRAKEN_PAIR_MAP[symbol]) {
    if (ageMs > 3 * 3600_000) {
      return { fresh: false, reason: 'Kripto saatlik veri akışı gecikmeli' };
    }
    return { fresh: true };
  }

  // Geleneksel enstrümanlarda son saatlik mum başlangıcından >105 dk geçtiyse tahta tatil/bakım molasındadır!
  if (ageMs > 105 * 60_000) {
    return { fresh: false, reason: 'Tahta Tatil / Seans Molasında (Son Mum Hareketsiz)' };
  }

  // Son 3 saatlik barda tek tik bile hareket yoksa (O=H=L=C kilitli) donmuş kotasyon
  const b1 = h1Bars[h1Bars.length - 1];
  const b2 = h1Bars[h1Bars.length - 2];
  const b3 = h1Bars[h1Bars.length - 3];
  const r1 = (b1.high ?? b1.close) - (b1.low ?? b1.close);
  const r2 = (b2.high ?? b2.close) - (b2.low ?? b2.close);
  if (
    r1 < 1e-12 &&
    r2 < 1e-12 &&
    Math.abs(b1.close - b2.close) < 1e-12 &&
    Math.abs(b2.close - b3.close) < 1e-12
  ) {
    return { fresh: false, reason: 'Donmuş Kotasyon / Hareketsiz Tatil Tahtası' };
  }

  return { fresh: true };
}

function getPrecisionForSymbol(symbol: string): number {
  if (symbol === 'DOGE/USD') return 6;
  if (symbol.includes('JPY')) return 3;
  if (
    symbol.includes('/') &&
    !symbol.startsWith('XAU') &&
    !symbol.startsWith('XAG') &&
    !KRAKEN_PAIR_MAP[symbol]
  ) {
    return 5;
  }
  if (symbol === 'COPPER' || symbol === 'XRP/USD' || symbol === 'ADA/USD') return 4;
  if (symbol === 'XAG/USD' || symbol === 'AVAX/USD' || symbol === 'LINK/USD') return 3;
  return 4;
}

// Kurumsal OHLCV Temizleyici:
// 1) JS 0 ?? c / NaN ?? c hatalarını engeller, high >= max(o,c) ve low <= min(o,c) zorlar.
// 2) Yahoo'nun saat ortasında eklediği hizasız sahte "canlı fiyat" barlarını (tsSec % 900 !== 0) eler.
// 3) Seans dışı ölü düz barları (O=H=L=C == prevClose, V=0) ve 0-hacimli sahte rollover iğnelerini temizler.
// 4) Tek barda >%22 bozuk veri sıçramalarını (örn. bozuk pre-sync kotasyon artefaktı) engeller.
export function sanitizeAndDedupeBars(
  rawRows: { tsSec: number; open: any; high: any; low: any; close: any; volume?: any; vwap?: any }[],
  intervalSec: number,
  symbol = ''
): HourlyBar[] {
  const byTs = new Map<number, HourlyBar>();
  const isCrypto = Boolean(KRAKEN_PAIR_MAP[symbol]);
  const maxSingleBarJump = isCrypto ? 0.32 : intervalSec >= 86400 ? 0.35 : 0.22;
  let prevValidClose = 0;

  for (const r of rawRows) {
    const tsSec = Number(r.tsSec);
    const c = Number(r.close);
    if (!Number.isFinite(tsSec) || tsSec <= 0 || !Number.isFinite(c) || c <= 0) continue;

    // 15m veya 1h serisinde Yahoo'nun saniye bazlı eklediği hizasız son tick pseudo-barını atla
    // Not: NYSE 09:30 ET barları tsSec % 1800 === 0 olduğundan % 900 === 0 kontrolünden güvenle geçer!
    if (intervalSec >= 900 && intervalSec < 86400 && tsSec % 900 !== 0) {
      continue;
    }

    // Bozuk veri sağlayıcı sıçraması (tek saatlik barda >%22 kopukluk) kontrolü
    if (
      prevValidClose > 0 &&
      intervalSec <= 3600 &&
      Math.abs(c - prevValidClose) / prevValidClose > maxSingleBarJump
    ) {
      continue;
    }

    const rawO = Number(r.open);
    const o = Number.isFinite(rawO) && rawO > 0 ? rawO : c;
    const rawH = Number(r.high);
    const rawL = Number(r.low);
    let h = Number.isFinite(rawH) && rawH > 0 ? Math.max(rawH, o, c) : Math.max(o, c);
    let l = Number.isFinite(rawL) && rawL > 0 ? Math.min(rawL, o, c) : Math.min(o, c);
    const rawV = Number(r.volume);
    const v = Number.isFinite(rawV) && rawV >= 0 ? rawV : 0;

    // Tamamen ölü bakım/kapalı seans barlarını atla (ATR ve RSI2 seyrelmesini sıfırlar)
    if (
      intervalSec < 86400 &&
      h - l < 1e-12 &&
      v === 0 &&
      prevValidClose > 0 &&
      Math.abs(c - prevValidClose) < 1e-12
    ) {
      continue;
    }

    // Sıfır hacimli sahte rollover iğnesi (bad-tick spike) kırpıcısı
    const body = Math.abs(c - o);
    const refPx = Math.max(o, c, 1e-9);
    if (v === 0 && body / refPx < 0.0015) {
      if ((h - Math.max(o, c)) / refPx > 0.025) {
        h = Math.max(o, c) + Math.max(body * 2.5, refPx * 0.002);
      }
      if ((Math.min(o, c) - l) / refPx > 0.025) {
        l = Math.min(o, c) - Math.max(body * 2.5, refPx * 0.002);
      }
    }

    const tsMs = tsSec * 1000;
    let durMs = intervalSec * 1000;
    if (intervalSec < 86400 && US_EQUITY_SYMBOLS_SET.has(symbol)) {
      const ny = getNyLocalTimeInfo(tsMs);
      const nyMinOfDay = ny.hour * 60 + ny.minute;
      // ABD Hisselerinde RTH seansı [09:30, 16:00) aralığında başlar; 16:00 kapanış müzayede hayalet barını atla!
      if (ny.dayOfWeek === 0 || ny.dayOfWeek === 6 || nyMinOfDay < 570 || nyMinOfDay >= 960) {
        continue;
      }
      if (intervalSec === 3600 && ny.hour === 15 && ny.minute === 30) {
        durMs = 1800 * 1000;
      }
    }

    const cleanBar: HourlyBar = {
      timestamp: tsMs,
      endTimestamp: tsMs + durMs,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    };
    if (Number.isFinite(Number(r.vwap)) && Number(r.vwap) > 0) {
      cleanBar.vwap = Number(r.vwap);
    }

    byTs.set(tsMs, cleanBar);
    prevValidClose = c;
  }

  return Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
}

const hourlyCache = new Map<string, { timestamp: number; data: HourlyBar[] }>();
const inFlightHourly = new Map<string, Promise<HourlyBar[]>>();
const bars15mCache = new Map<string, { timestamp: number; data: HourlyBar[] }>();
const inFlight15m = new Map<string, Promise<HourlyBar[]>>();

const KRAKEN_PAIR_MAP: Record<string, string> = {
  'BTC/USD': 'XXBTZUSD',
  'ETH/USD': 'XETHZUSD',
  'SOL/USD': 'SOLUSD',
  'BNB/USD': 'BNBUSD',
  'XRP/USD': 'XXRPZUSD',
  'AVAX/USD': 'AVAXUSD',
  'LINK/USD': 'LINKUSD',
  'DOGE/USD': 'XDGUSD',
  'ADA/USD': 'ADAUSD',
};

export interface LiveOrderbookQuote {
  bid: number;
  ask: number;
  mid: number;
  last: number;
}

let krakenTickCache: { timestamp: number; quotes: Record<string, LiveOrderbookQuote> } | null = null;
let inFlightKrakenTick: Promise<Record<string, LiveOrderbookQuote>> | null = null;

export async function fetchLiveCryptoQuotes(): Promise<Record<string, LiveOrderbookQuote>> {
  const now = Date.now();
  if (krakenTickCache && now - krakenTickCache.timestamp < 2500) {
    return krakenTickCache.quotes;
  }
  if (inFlightKrakenTick) {
    return inFlightKrakenTick;
  }

  inFlightKrakenTick = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const resp = await fetch(
        'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,BNBUSD,XRPUSD,AVAXUSD,LINKUSD,XDGUSD,ADAUSD',
        { signal: controller.signal, headers: { Accept: 'application/json' } }
      );
      if (!resp.ok) return krakenTickCache?.quotes || {};
      const json: any = await resp.json();
      const result = json?.result || {};
      const quotes: Record<string, LiveOrderbookQuote> = {};
      for (const [sym, kKey] of Object.entries(KRAKEN_PAIR_MAP)) {
        const entry = result[kKey];
        if (entry && entry.a && entry.b) {
          const ask = Number(entry.a[0]);
          const bid = Number(entry.b[0]);
          const last = entry.c ? Number(entry.c[0]) : (ask + bid) / 2;
          const decimals =
            sym === 'DOGE/USD'
              ? 6
              : sym === 'XRP/USD' || sym === 'ADA/USD'
              ? 4
              : sym === 'AVAX/USD' || sym === 'LINK/USD'
              ? 3
              : 2;
          if (Number.isFinite(ask) && Number.isFinite(bid) && ask > 0 && bid > 0) {
            quotes[sym] = {
              bid: +bid.toFixed(decimals),
              ask: +ask.toFixed(decimals),
              mid: +((bid + ask) / 2).toFixed(decimals),
              last: +last.toFixed(decimals),
            };
          }
        }
      }
      krakenTickCache = { timestamp: Date.now(), quotes };
      return quotes;
    } catch {
      return krakenTickCache?.quotes || {};
    } finally {
      clearTimeout(timeout);
      inFlightKrakenTick = null;
    }
  })();

  return inFlightKrakenTick;
}

// Real 1-Year OHLC Data Fetcher (with TTL Cache, In-Flight Deduplication & Real-Time Kraken Bid/Ask Quote Overlay)
export async function fetchReal1YearData(symbol: string) {
  const now = Date.now();
  const cached = ohlcCache.get(symbol);
  if (cached && now - cached.timestamp < OHLC_CACHE_TTL) {
    if (KRAKEN_PAIR_MAP[symbol]) {
      const liveQuotes = await fetchLiveCryptoQuotes();
      const q = liveQuotes[symbol];
      if (q && q.mid > 0) {
        const cloned = {
          ...cached.data,
          price: q.mid,
          bid: q.bid,
          ask: q.ask,
          lastUpdated: new Date().toISOString(),
        };
        if (Array.isArray(cloned.candles) && cloned.candles.length > 0) {
          const candlesCopy = cloned.candles.slice();
          const lastIdx = candlesCopy.length - 1;
          candlesCopy[lastIdx] = {
            ...candlesCopy[lastIdx],
            close: q.mid,
            high: Math.max(candlesCopy[lastIdx].high, q.mid),
            low: Math.min(candlesCopy[lastIdx].low, q.mid),
          };
          cloned.candles = candlesCopy;
        }
        return cloned;
      }
    }
    return cached.data;
  }
  if (inFlightOhlc.has(symbol)) {
    return inFlightOhlc.get(symbol)!;
  }

  const fetchPromise = (async () => {
    const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1y&interval=1d`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!resp.ok) {
        if (cached) return cached.data;
        throw new Error(`Yahoo Finance HTTP error: ${resp.status}`);
      }

      const data: any = await resp.json();
      const result = data?.chart?.result?.[0];
      if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
        if (cached) return cached.data;
        throw new Error('Geçersiz veri yapısı');
      }

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators.quote[0];
      const meta = result.meta;
      const dec = getPrecisionForSymbol(symbol);

      const sanitizedDaily = sanitizeAndDedupeBars(
        timestamps.map((t, i) => ({
          tsSec: t,
          open: quote.open?.[i],
          high: quote.high?.[i],
          low: quote.low?.[i],
          close: quote.close?.[i],
          volume: quote.volume?.[i],
        })),
        86400,
        symbol
      );

      const candles = sanitizedDaily.map((b) => ({
        timestamp: b.timestamp,
        dateStr: new Date(b.timestamp).toISOString().split('T')[0],
        open: +(b.open ?? b.close).toFixed(dec),
        high: +(b.high ?? b.close).toFixed(dec),
        low: +(b.low ?? b.close).toFixed(dec),
        close: +b.close.toFixed(dec),
        volume: b.volume ?? 0,
      }));

      const lastCandleClose = candles.length > 0 ? candles[candles.length - 1].close : 0;
      const rawRegular = Number(meta.regularMarketPrice);
      // Eğer meta.regularMarketPrice son mumdan aşırı kopuksa (>%12 veri sağlayıcı artefaktı) son mumu esas al
      let currentPrice =
        Number.isFinite(rawRegular) && rawRegular > 0 && (lastCandleClose === 0 || Math.abs(rawRegular - lastCandleClose) / lastCandleClose < 0.12)
          ? rawRegular
          : lastCandleClose;

      let liveBid: number | undefined;
      let liveAsk: number | undefined;
      if (KRAKEN_PAIR_MAP[symbol]) {
        const liveQuotes = await fetchLiveCryptoQuotes();
        const q = liveQuotes[symbol];
        if (q && q.mid > 0) {
          currentPrice = q.mid;
          liveBid = q.bid;
          liveAsk = q.ask;
        }
      }

      if (candles.length > 0 && currentPrice > 0) {
        const lastIdx = candles.length - 1;
        candles[lastIdx].close = +currentPrice.toFixed(dec);
        candles[lastIdx].high = +Math.max(candles[lastIdx].high, candles[lastIdx].open, currentPrice).toFixed(dec);
        candles[lastIdx].low = +Math.min(candles[lastIdx].low, candles[lastIdx].open, currentPrice).toFixed(dec);
      }

      // Gerçek 24 Saatlik Değişim: 1 yıllık grafikte chartPreviousClose 1 yıl önceki fiyattır; bir önceki günlük mum kapanışını kullan!
      const prevDayClose =
        candles.length >= 2
          ? candles[candles.length - 2].close
          : Number(meta.previousClose) > 0
          ? Number(meta.previousClose)
          : currentPrice;

      const change24h = +(currentPrice - prevDayClose).toFixed(dec);
      const changePercent24h = prevDayClose > 0 ? +((change24h / prevDayClose) * 100).toFixed(2) : 0;

      const payload = {
        symbol,
        ticker: yahooTicker,
        price: currentPrice,
        bid: liveBid,
        ask: liveAsk,
        change24h,
        changePercent24h,
        currency: meta.currency || 'USD',
        exchangeTimezoneName: meta.exchangeTimezoneName,
        candles,
        lastUpdated: new Date().toISOString(),
      };

      ohlcCache.set(symbol, { timestamp: Date.now(), data: payload });
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  })();

  inFlightOhlc.set(symbol, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightOhlc.delete(symbol);
  }
}

// 30 Günlük Saatlik Geçmiş Mum Verisi (Kripto için doğrudan Kraken 60m OHLCV, TradFi için Yahoo 1mo/1h + Canlı Fiyat Bindirmeli)
export async function fetchRealHourlyHistory(symbol: string): Promise<HourlyBar[]> {
  const now = Date.now();
  const cached = hourlyCache.get(symbol);
  if (cached && now - cached.timestamp < OHLC_CACHE_TTL) {
    if (KRAKEN_PAIR_MAP[symbol] && cached.data.length > 0) {
      const liveQuotes = await fetchLiveCryptoQuotes();
      const q = liveQuotes[symbol];
      if (q && q.mid > 0) {
        const copy = cached.data.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          ...last,
          close: q.mid,
          high: Math.max(last.high ?? q.mid, q.mid),
          low: Math.min(last.low ?? q.mid, q.mid),
        };
        return copy;
      }
    }
    return cached.data;
  }
  if (inFlightHourly.has(symbol)) {
    return inFlightHourly.get(symbol)!;
  }

  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      let list: HourlyBar[] = [];

      // 1) Kripto enstrümanları için doğrudan Kraken 60dk canlı OHLCV (720 bar = 30 gün, gerçek hacim + VWAP)
      if (KRAKEN_PAIR_MAP[symbol]) {
        try {
          const kPair = KRAKEN_PAIR_MAP[symbol];
          const kResp = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${kPair}&interval=60`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (kResp.ok) {
            const kJson: any = await kResp.json();
            const resKey = Object.keys(kJson?.result || {}).find((k) => k !== 'last');
            const rows: any[] = resKey ? kJson.result[resKey] || [] : [];
            list = sanitizeAndDedupeBars(
              rows.map((r) => ({
                tsSec: Number(r[0]),
                open: r[1],
                high: r[2],
                low: r[3],
                close: r[4],
                vwap: r[5],
                volume: r[6],
              })),
              3600,
              symbol
            );
          }
        } catch {
          // fallback below
        }
      }

      // 2) TradFi veya Kraken fallback için Yahoo 1 aylık 1h OHLCV
      if (list.length === 0) {
        const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1mo&interval=1h`;
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });
        if (!resp.ok) return cached?.data || [];
        const data: any = await resp.json();
        const result = data?.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return cached?.data || [];

        const timestamps: number[] = result.timestamp;
        const quote = result.indicators.quote[0];
        list = sanitizeAndDedupeBars(
          timestamps.map((t, i) => ({
            tsSec: t,
            open: quote.open?.[i],
            high: quote.high?.[i],
            low: quote.low?.[i],
            close: quote.close?.[i],
            volume: quote.volume?.[i],
          })),
          3600,
          symbol
        );
      }

      if (list.length > 0 && KRAKEN_PAIR_MAP[symbol]) {
        const liveQuotes = await fetchLiveCryptoQuotes();
        const q = liveQuotes[symbol];
        if (q && q.mid > 0) {
          const last = list[list.length - 1];
          last.close = q.mid;
          last.high = Math.max(last.high ?? q.mid, q.mid);
          last.low = Math.min(last.low ?? q.mid, q.mid);
        }
      }

      if (list.length > 0) {
        hourlyCache.set(symbol, { timestamp: Date.now(), data: list });
      }
      return list;
    } catch {
      return cached?.data || [];
    } finally {
      clearTimeout(timeout);
    }
  })();

  inFlightHourly.set(symbol, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightHourly.delete(symbol);
  }
}

// =========================================================================
// ZELTRA v14 KURUMSAL UZUN DÖNEM VERİ KATMANI (2Y SAATLİK + TEMİZ GÜNLÜK)
// Yahoo Finance FX günlük gece yarısı OHLC bozulmasını 1H agregasyonla sıfırlar.
// =========================================================================
const extendedHourlyCache = new Map<string, { timestamp: number; data: HourlyBar[] }>();
const inFlightExtendedHourly = new Map<string, Promise<HourlyBar[]>>();
const cleanDailyCache = new Map<string, { timestamp: number; data: HourlyBar[] }>();
const inFlightCleanDaily = new Map<string, Promise<HourlyBar[]>>();

const EXTENDED_CACHE_TTL = 10 * 60 * 1000; // 10 dk (tarihsel 2Y veri + canlı son bar bindirmeli)
const FX_SYMBOLS_SET = new Set([
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'USD/TRY', 'EUR/TRY', 'GBP/TRY',
]);

// Kurumsal Seans-Duyarlı Çoklu-Zaman Dilimi Agregasyonu (DST-Aware NY 17:00 ET & US Equity RTH Split):
// 1) Kripto: Standart UTC blokları (00:00 / 12:00 UTC).
// 2) FX, Değerli Metaller, Enerji, Endeks Vadeli: 17:00 America/New_York seans kapanışı (Pazar 22:00 UTC sahte günlük mumları sıfırlar!).
// 3) ABD Hisseleri (NVDA, AAPL, MSFT): 12H istendiğinde NYSE seansını Sabah [09:30–12:30 ET] ve Öğleden Sonra [12:30–16:00 ET]
//    olarak iki gerçek yarı-seans barına böler (12H serisinin 1G serisine çökmesini engeller!).
export function aggregateBarsByHours(bars1h: HourlyBar[], bucketHours: number, symbol = ''): HourlyBar[] {
  const map = new Map<number, HourlyBar>();
  const mode = symbol ? getSessionMode(symbol) : 'CRYPTO_UTC';
  const ms = bucketHours * 3600 * 1000;

  for (const b of bars1h) {
    if (!b || !(b.close > 0)) continue;
    let bucketStart = Math.floor(b.timestamp / ms) * ms;
    let bucketEnd = bucketStart + ms;

    if (mode === 'US_EQUITY_RTH' && bucketHours === 12) {
      const ny = getNyLocalTimeInfo(b.timestamp);
      const dayMidnightUtc = Date.UTC(ny.year, ny.month - 1, ny.day, 0, 0, 0) - ny.offsetHours * 3600 * 1000;
      if (ny.minutesOfDay < 12 * 60 + 30) {
        bucketStart = dayMidnightUtc + (9 * 60 + 30) * 60 * 1000;
        bucketEnd = dayMidnightUtc + (12 * 60 + 30) * 60 * 1000;
      } else {
        bucketStart = dayMidnightUtc + (12 * 60 + 30) * 60 * 1000;
        bucketEnd = dayMidnightUtc + 16 * 60 * 1000;
      }
    } else if (mode === 'NY_CLOSE_17ET' && (bucketHours === 24 || bucketHours === 12)) {
      const nyOff = getNyUtcOffsetHours(b.timestamp);
      const shiftMs = (7 + nyOff) * 3600 * 1000; // +2h EST, +3h EDT -> 17:00 ET maps to 00:00 shifted!
      let shiftedTs = b.timestamp + shiftMs;
      const shiftedDay = new Date(shiftedTs).getUTCDay();
      if (shiftedDay === 0) {
        // Pazar 17:00 ET öncesi sığ açılış ticklerini Pazartesi seansına birleştir
        const nextMon = (Math.floor(shiftedTs / 86400000) + 1) * 86400000;
        shiftedTs = nextMon;
      } else if (shiftedDay === 6) {
        // Cumartesi artığı varsa Cuma son seansına sabitle
        const friEnd = Math.floor(shiftedTs / 86400000) * 86400000 - 1000;
        shiftedTs = friEnd;
      }
      const kShifted = Math.floor(shiftedTs / ms) * ms;
      bucketStart = kShifted - shiftMs;
      bucketEnd = bucketStart + ms;
    }

    const prev = map.get(bucketStart);
    const o = b.open ?? b.close;
    const h = Math.max(b.high ?? b.close, o, b.close);
    const l = Math.min(b.low ?? b.close, o, b.close);
    if (!prev) {
      map.set(bucketStart, {
        timestamp: bucketStart,
        endTimestamp: bucketEnd,
        open: o,
        high: h,
        low: l,
        close: b.close,
        volume: b.volume ?? 0,
      });
    } else {
      prev.high = Math.max(prev.high ?? prev.close, h);
      prev.low = Math.min(prev.low ?? prev.close, l);
      prev.close = b.close;
      prev.volume = (prev.volume ?? 0) + (b.volume ?? 0);
      if (bucketEnd > (prev.endTimestamp ?? 0)) prev.endTimestamp = bucketEnd;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchYahooChartBars(symbol: string, range: string, interval: string, timeoutMs = 12000): Promise<HourlyBar[]> {
  const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const intervalSec = interval === '1d' ? 86400 : interval === '15m' ? 900 : 3600;
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];
    const ts: number[] = result.timestamp;
    const q = result.indicators.quote[0];
    return sanitizeAndDedupeBars(
      ts.map((t, i) => ({
        tsSec: t,
        open: q.open?.[i],
        high: q.high?.[i],
        low: q.low?.[i],
        close: q.close?.[i],
        volume: q.volume?.[i],
      })),
      intervalSec,
      symbol
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchExtendedHourlyHistory(symbol: string, range: '90d' | '1y' | '730d' = '730d'): Promise<HourlyBar[]> {
  const key = `${symbol}:${range}`;
  const now = Date.now();
  const cached = extendedHourlyCache.get(key);
  if (cached && now - cached.timestamp < EXTENDED_CACHE_TTL && cached.data.length > 0) {
    // Canlı kripto/son saat fiyatını tazele
    if (KRAKEN_PAIR_MAP[symbol]) {
      const liveQ = await fetchLiveCryptoQuotes();
      const q = liveQ[symbol];
      if (q && q.mid > 0) {
        const copy = cached.data.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, close: q.mid, high: Math.max(last.high ?? q.mid, q.mid), low: Math.min(last.low ?? q.mid, q.mid) };
        return copy;
      }
    }
    return cached.data;
  }
  if (inFlightExtendedHourly.has(key)) return inFlightExtendedHourly.get(key)!;

  const p = (async () => {
    const base = await fetchYahooChartBars(symbol, range, '1h', 14000);
    // Son 30 gün canlı Kraken/Yahoo verisiyle son kuyruğu birleştir
    const recent = await fetchRealHourlyHistory(symbol).catch(() => [] as HourlyBar[]);
    let merged = base;
    if (recent.length > 0) {
      if (base.length === 0) {
        merged = recent;
      } else {
        const recentStart = recent[0].timestamp;
        merged = [...base.filter((b) => b.timestamp < recentStart - 1800 * 1000), ...recent];
      }
    }
    if (merged.length > 0) {
      extendedHourlyCache.set(key, { timestamp: Date.now(), data: merged });
      return merged;
    }
    return cached?.data || [];
  })();

  inFlightExtendedHourly.set(key, p);
  try {
    return await p;
  } finally {
    inFlightExtendedHourly.delete(key);
  }
}

export async function fetchCleanDailyHistory(symbol: string): Promise<HourlyBar[]> {
  const now = Date.now();
  const cached = cleanDailyCache.get(symbol);
  if (cached && now - cached.timestamp < EXTENDED_CACHE_TTL && cached.data.length > 0) {
    if (KRAKEN_PAIR_MAP[symbol]) {
      const liveQ = await fetchLiveCryptoQuotes();
      const q = liveQ[symbol];
      if (q && q.mid > 0) {
        const copy = cached.data.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          ...last,
          close: q.mid,
          high: Math.max(last.high ?? q.mid, last.open ?? q.mid, q.mid),
          low: Math.min(last.low ?? q.mid, last.open ?? q.mid, q.mid),
        };
        return copy;
      }
    }
    return cached.data;
  }
  if (inFlightCleanDaily.has(symbol)) return inFlightCleanDaily.get(symbol)!;

  const p = (async () => {
    const [h2y, d5y] = await Promise.all([
      FX_SYMBOLS_SET.has(symbol) || KRAKEN_PAIR_MAP[symbol]
        ? fetchExtendedHourlyHistory(symbol, '730d')
        : US_EQUITY_SYMBOLS_SET.has(symbol)
          ? Promise.resolve([] as HourlyBar[])
          : fetchExtendedHourlyHistory(symbol, '730d'),
      FX_SYMBOLS_SET.has(symbol) ? Promise.resolve([] as HourlyBar[]) : fetchYahooChartBars(symbol, '5y', '1d', 12000),
    ]);

    // ABD hisselerinde resmi NYSE açılış/kapanış müzayedesini içeren günlük barları doğrudan koru!
    let out: HourlyBar[];
    if (US_EQUITY_SYMBOLS_SET.has(symbol) && d5y.length >= 200) {
      out = d5y;
    } else {
      const clean2y = aggregateBarsByHours(h2y, 24, symbol);
      if (FX_SYMBOLS_SET.has(symbol)) {
        out = clean2y.length >= 200 ? clean2y : await fetchYahooChartBars(symbol, '2y', '1d', 10000);
      } else if (d5y.length > 0 && clean2y.length > 0) {
        const firstClean = clean2y[0].timestamp;
        out = [...d5y.filter((b) => b.timestamp < firstClean - 14 * 3600 * 1000), ...clean2y];
      } else {
        out = clean2y.length > 0 ? clean2y : d5y;
      }
    }

    if (out.length > 0) {
      cleanDailyCache.set(symbol, { timestamp: Date.now(), data: out });
      return out;
    }
    return cached?.data || [];
  })();

  inFlightCleanDaily.set(symbol, p);
  try {
    return await p;
  } finally {
    inFlightCleanDaily.delete(symbol);
  }
}

// 15 Dakikalık Yüksek Hassasiyetli Mikro-Zamanlama Verisi (Kripto: Kraken 15m / TradFi: Yahoo 5d 15m)
export async function fetchReal15mHistory(symbol: string): Promise<HourlyBar[]> {
  const now = Date.now();
  const cached = bars15mCache.get(symbol);
  if (cached && now - cached.timestamp < 15000) {
    if (KRAKEN_PAIR_MAP[symbol] && cached.data.length > 0) {
      const liveQuotes = await fetchLiveCryptoQuotes();
      const q = liveQuotes[symbol];
      if (q && q.mid > 0) {
        const copy = cached.data.slice();
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          ...last,
          close: q.mid,
          high: Math.max(last.high ?? q.mid, last.open ?? q.mid, q.mid),
          low: Math.min(last.low ?? q.mid, last.open ?? q.mid, q.mid),
        };
        return copy;
      }
    }
    return cached.data;
  }
  if (inFlight15m.has(symbol)) return inFlight15m.get(symbol)!;

  const p = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      let list: HourlyBar[] = [];
      if (KRAKEN_PAIR_MAP[symbol]) {
        const kPair = KRAKEN_PAIR_MAP[symbol];
        const kResp = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${kPair}&interval=15`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (kResp.ok) {
          const kJson: any = await kResp.json();
          const resKey = Object.keys(kJson?.result || {}).find((k) => k !== 'last');
          const rows: any[] = resKey ? kJson.result[resKey] || [] : [];
          list = sanitizeAndDedupeBars(
            rows.map((r) => ({
              tsSec: Number(r[0]),
              open: r[1],
              high: r[2],
              low: r[3],
              close: r[4],
              vwap: r[5],
              volume: r[6],
            })),
            900,
            symbol
          );
        }
      } else {
        const yahooTicker = SYMBOL_MAP[symbol] || symbol.replace('/', '');
        const resp = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=5d&interval=15m`,
          { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (resp.ok) {
          const data: any = await resp.json();
          const result = data?.chart?.result?.[0];
          const ts: number[] = result?.timestamp || [];
          const q = result?.indicators?.quote?.[0] || {};
          list = sanitizeAndDedupeBars(
            ts.map((t, i) => ({
              tsSec: t,
              open: q.open?.[i],
              high: q.high?.[i],
              low: q.low?.[i],
              close: q.close?.[i],
              volume: q.volume?.[i],
            })),
            900,
            symbol
          );
        }
      }

      if (list.length > 0 && KRAKEN_PAIR_MAP[symbol]) {
        const q = (await fetchLiveCryptoQuotes())[symbol];
        if (q && q.mid > 0) {
          const last = list[list.length - 1];
          last.close = q.mid;
          last.high = Math.max(last.high ?? q.mid, q.mid);
          last.low = Math.min(last.low ?? q.mid, q.mid);
        }
      }
      if (list.length > 0) bars15mCache.set(symbol, { timestamp: Date.now(), data: list });
      return list;
    } catch {
      return cached?.data || [];
    } finally {
      clearTimeout(timeout);
    }
  })();

  inFlight15m.set(symbol, p);
  try {
    return await p;
  } finally {
    inFlight15m.delete(symbol);
  }
}

export interface MacroPulseSnapshot {
  dxyPrice: number;
  dxyChg3mPct: number;
  dxyChg15mPct: number;
  vixPrice: number;
  vixChg5mPct: number;
  us10yYield: number;
  us10yChg5mPct: number;
  fetchedAt: number;
}

let macroPulseCache: { timestamp: number; data: MacroPulseSnapshot } | null = null;
let inFlightMacro: Promise<MacroPulseSnapshot> | null = null;

async function fetchYahoo1mBarsRaw(yahooTicker: string, range = '2d'): Promise<{ bars: HourlyBar[]; metaPrice: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9500);
    try {
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${range}&interval=1m&includePrePost=true`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        }
      );
      if (!resp.ok) continue;
      const data: any = await resp.json();
      const result = data?.chart?.result?.[0];
      const ts: number[] = result?.timestamp || [];
      const q = result?.indicators?.quote?.[0] || {};
      const bars: HourlyBar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close?.[i];
        if (c !== null && c !== undefined && Number.isFinite(c)) {
          const o = Number.isFinite(q.open?.[i]) ? Number(q.open[i]) : Number(c);
          bars.push({
            timestamp: ts[i] * 1000,
            open: o,
            high: Number.isFinite(q.high?.[i]) ? Number(q.high[i]) : Math.max(o, Number(c)),
            low: Number.isFinite(q.low?.[i]) ? Number(q.low[i]) : Math.min(o, Number(c)),
            close: Number(c),
            volume: Number(q.volume?.[i]) || 0,
          });
        }
      }
      const metaPrice = Number(result?.meta?.regularMarketPrice) || (bars.length ? bars[bars.length - 1].close : 0);
      if (bars.length > 0 || attempt === 1) return { bars, metaPrice };
    } catch {
      if (attempt === 1) return { bars: [], metaPrice: 0 };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { bars: [], metaPrice: 0 };
}

export async function fetchMacroPulse(): Promise<MacroPulseSnapshot> {
  const now = Date.now();
  if (macroPulseCache && now - macroPulseCache.timestamp < 30000) {
    return macroPulseCache.data;
  }
  if (inFlightMacro) return inFlightMacro;

  inFlightMacro = (async (): Promise<MacroPulseSnapshot> => {
    try {
      const [dxyRes, vixRes, tnxRes] = await Promise.all([
        fetchYahoo1mBarsRaw('DX-Y.NYB', '1d'),
        fetchYahoo1mBarsRaw('^VIX', '1d'),
        fetchYahoo1mBarsRaw('^TNX', '1d'),
      ]);

      const calcPctBack = (bars: HourlyBar[], mins: number) => {
        if (bars.length < 2) return 0;
        const latest = bars[bars.length - 1];
        const cutoff = latest.timestamp - mins * 60000;
        const ref = bars.find((b) => b.timestamp >= cutoff) || bars[0];
        return ref && ref.close > 0 ? +(((latest.close - ref.close) / ref.close) * 100).toFixed(4) : 0;
      };

      const snap: MacroPulseSnapshot = {
        dxyPrice: dxyRes.metaPrice || (dxyRes.bars.length ? dxyRes.bars[dxyRes.bars.length - 1].close : 0),
        dxyChg3mPct: calcPctBack(dxyRes.bars, 3),
        dxyChg15mPct: calcPctBack(dxyRes.bars, 15),
        vixPrice: vixRes.metaPrice || (vixRes.bars.length ? vixRes.bars[vixRes.bars.length - 1].close : 0),
        vixChg5mPct: calcPctBack(vixRes.bars, 5),
        us10yYield: tnxRes.metaPrice || (tnxRes.bars.length ? tnxRes.bars[tnxRes.bars.length - 1].close : 0),
        us10yChg5mPct: calcPctBack(tnxRes.bars, 5),
        fetchedAt: Date.now(),
      };
      macroPulseCache = { timestamp: Date.now(), data: snap };
      return snap;
    } catch {
      return (
        macroPulseCache?.data || {
          dxyPrice: 0,
          dxyChg3mPct: 0,
          dxyChg15mPct: 0,
          vixPrice: 0,
          vixChg5mPct: 0,
          us10yYield: 0,
          us10yChg5mPct: 0,
          fetchedAt: Date.now(),
        }
      );
    } finally {
      inFlightMacro = null;
    }
  })();

  return inFlightMacro;
}

// Multi-Source Financial Feeds (14 Global Financial & Market Feeds — Last 24 Hours)
const FINANCIAL_NEWS_FEEDS = [
  { source: 'CNBC Markets', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { source: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { source: 'CNBC Investing', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html' },
  { source: 'CNBC Technology', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
  { source: 'MarketWatch / Dow Jones', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
  { source: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'Wall Street Journal Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { source: 'Wall Street Journal Economy', url: 'https://feeds.a.dj.com/rss/RSSEconomics.xml' },
  { source: 'Investing.com Forex', url: 'https://www.investing.com/rss/forex.rss' },
  { source: 'Investing.com Emtia (Altın & Petrol)', url: 'https://www.investing.com/rss/commodities.rss' },
  { source: 'Investing.com Borsa', url: 'https://www.investing.com/rss/stock.rss' },
  { source: 'Yahoo Finance Markets', url: 'https://finance.yahoo.com/news/rssindex' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

// Magazin, Yaşam, Seyahat ve Kişisel Tüketici Şikayeti Filtresi (Örn: Moneyist aile/araba tamiri/vasiyet haberlerini kesin eler)
const NON_FINANCIAL_LIFESTYLE_BLOCKLIST = [
  'boarding', 'luggage', 'baggage', 'overhead bin', 'sick of flying', 'vacation',
  'wedding', 'divorce', 'mother-in-law', 'stepchild', 'inheritance', 'etiquette',
  'tipping', 'horoscope', 'celebrity', 'recipe', 'diet', 'workout', 'cruise ship',
  'hotel room', 'dating', 'spouse', 'funeral', 'pet', 'dog', 'cat',
  'worst fight', 'is that unreasonable', 'retire at', 'my older brother', 'only sister',
  'out of his will', 'do i tell', 'moneyist', 'dear penny', 'prediction markets call',
  'elderly', 'aging mother', 'aging mom', 'my mother', 'my mom', 'cousin', 'car repair',
  'sours me', 'nephew', 'niece', 'brother-in-law', 'sister-in-law', '401(k)', 'social security',
];

// Enstrüman Bazlı Kurumsal Anahtar Kelime Haritası (Tam Kelime Sınırı Kontrollü)
const ASSET_KEYWORD_MAP: Record<string, string[]> = {
  'EUR/USD': ['eur/usd', 'eurusd', 'eurozone', 'ecb', 'lagarde', 'avrupa merkez bankası', 'euro'],
  'GBP/USD': ['gbp/usd', 'gbpusd', 'pound sterling', 'boe', 'bailey', 'bank of england', 'uk inflation', 'britain', 'sterlin'],
  'USD/TRY': ['usd/try', 'usdtry', 'turkey', 'lira', 'cbrt', 'tcmb', 'turkish lira'],
  'USD/JPY': ['usd/jpy', 'usdjpy', 'japanese yen', 'boj', 'ueda', 'bank of japan', 'japon yeni'],
  'USD/CHF': ['usd/chf', 'usdchf', 'swiss franc', 'snb', 'switzerland', 'isviçre frangı'],
  'AUD/USD': ['aud/usd', 'audusd', 'australian dollar', 'rba', 'aussie', 'avustralya doları'],
  'USD/CAD': ['usd/cad', 'usdcad', 'canadian dollar', 'boc', 'loonie', 'kanada doları'],
  'XAU/USD': ['xau/usd', 'xauusd', 'gold', 'bullion', 'precious metal', 'safe haven', 'safe-haven', 'ons altın', 'altın'],
  'XAG/USD': ['xag/usd', 'xagusd', 'silver', 'gümüş'],
  'WTI': ['wti', 'crude oil', 'west texas', 'opec', 'petroleum', 'oil prices', 'barrel of oil', 'ham petrol', 'brent crude'],
  'BRENT': ['brent', 'brent crude', 'opec', 'north sea oil', 'oil prices'],
  'NATGAS': ['natural gas', 'natgas', 'lng', 'doğalgaz'],
  'BTC/USD': ['btc/usd', 'btc', 'bitcoin', 'crypto', 'coindesk', 'cointelegraph', 'bitcoin etf', 'crypto etf', 'halving', 'binance', 'coinbase', 'kripto'],
  'ETH/USD': ['eth/usd', 'ethereum', 'ether', 'defi', 'ether etf', 'staking'],
  'SOL/USD': ['sol/usd', 'solana'],
  'BNB/USD': ['bnb/usd', 'bnb', 'binance coin', 'bsc'],
  'XRP/USD': ['xrp/usd', 'ripple', 'xrp'],
  'AVAX/USD': ['avax/usd', 'avax', 'avalanche'],
  'LINK/USD': ['link/usd', 'chainlink'],
  'DOGE/USD': ['doge/usd', 'doge', 'dogecoin', 'memecoin'],
  'ADA/USD': ['ada/usd', 'cardano'],
  'NVDA': ['nvidia', 'nvda', 'jensen huang', 'blackwell', 'semiconductor', 'ai chip', 'gpu', 'yapay zeka çip'],
  'AAPL': ['apple', 'aapl', 'iphone', 'tim cook', 'cupertino'],
  'MSFT': ['microsoft', 'msft', 'satya nadella', 'azure', 'copilot'],
  'GOOGL': ['alphabet', 'google', 'googl', 'sundar pichai', 'waymo'],
  'AMZN': ['amazon', 'amzn', 'aws', 'andy jassy'],
  'META': ['meta platforms', 'zuckerberg', 'instagram', 'whatsapp'],
  'AMD': ['advanced micro devices', 'amd', 'lisa su'],
  'TSLA': ['tesla', 'tsla', 'elon musk', 'electric vehicle', 'cybertruck'],
  'SPX500': ['s&p 500', 's&p500', 'spx', 'wall street', 'us stocks', 'dow jones'],
  'NAS100': ['nasdaq', 'tech stocks', 'big tech', 'qqq', 'ai trade', 'yapay zeka ticaret'],
  'US30': ['dow jones', 'djia', 'blue-chip'],
  'GER40': ['dax', 'german economy', 'bundesbank'],
  'US10Y': ['10-year treasury', 'treasury yield', 'treasury yields', 'bond yields', 'us10y'],
};

// Küresel Makro / ABD Merkez Bankası Anahtar Kelimeleri (Yalnızca gerçek majör makro olayları bağlar)
const GLOBAL_MACRO_KEYWORDS = [
  'federal reserve', 'powell', 'fomc', 'interest rate', 'interest rates', 'rate cut', 'rate hike',
  'u.s. inflation', 'us inflation', 'cpi', 'pce', 'ppi', 'nonfarm', 'payrolls', 'jobless claims',
  'recession', 'treasury yield', 'treasury yields', 'dxy', 'greenback', 'enflasyon verisi', 'faiz kararı',
];

// Alt-kelime (substring) tuzaklarını önleyen kelime sınırı kontrolcüsü (Örn: "turmoil" != "oil", "yeniden" != "yen")
function matchesKeywordWithBoundary(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Kısa veya ek alabilecek kelimelerde tam kelime sınırı ara
  const regex = new RegExp(`(^|[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ])${escaped}($|[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ])`, 'i');
  return regex.test(text);
}

// Ham İngilizce ve Türkçe Metin Üzerinden Varlık Eşleştirme ve Bağlamsal Duyarlılık (NLP) Analizi
export function analyzeFinancialHeadline(rawTitle: string, rawDesc: string, source: string, trTitle?: string, trDesc?: string) {
  const rawCombined = `${rawTitle} ${rawDesc}`.toLowerCase();
  const fullCombined = `${rawTitle} ${rawDesc} ${trTitle || ''} ${trDesc || ''}`.toLowerCase();

  // 1. Yaşam / Magazin / Seyahat Haberi Kontrolü
  for (const blocked of NON_FINANCIAL_LIFESTYLE_BLOCKLIST) {
    if (matchesKeywordWithBoundary(rawCombined, blocked)) {
      return null; // Finans dışı haberi tamamen reddet
    }
  }

  // 2. Etkilenen Varlıkları Tespit Et (Öncelikle Orjinal İngilizce Metin Üzerinden Tam Sınırla)
  const affectedAssets: string[] = [];
  for (const [symbol, keys] of Object.entries(ASSET_KEYWORD_MAP)) {
    if (keys.some((k) => matchesKeywordWithBoundary(rawCombined, k) || (k.length > 5 && matchesKeywordWithBoundary(fullCombined, k)))) {
      affectedAssets.push(symbol);
    }
  }

  if (source === 'CoinDesk' && !affectedAssets.includes('BTC/USD')) {
    affectedAssets.push('BTC/USD');
  }

  const isMacro = GLOBAL_MACRO_KEYWORDS.some((k) => matchesKeywordWithBoundary(rawCombined, k));
  if (isMacro) {
    if (!affectedAssets.includes('XAU/USD')) affectedAssets.push('XAU/USD');
    if (!affectedAssets.includes('EUR/USD')) affectedAssets.push('EUR/USD');
    if (!affectedAssets.includes('SPX500')) affectedAssets.push('SPX500');
  }

  // Hiçbir finansal varlık veya makro göstergeyle ilgisi yoksa elenir (alakasız başlıkları SPX500/NVDA'ya zorlama)
  if (affectedAssets.length === 0) {
    return null;
  }

  // 3. Bağlamsal (Phrase-First + Tam Kelime Sınırı) Duyarlılık ve Risk Skoru Hesabı (-1.0 ile +1.0 arası)
  let rawScore = 0;
  let cleanedForSingleWords = fullCombined;

  // Önce bileşik makro ifadeler (Ters anlam tuzaklarını önler: örn. "interest rates surge" yükseliş değil, faiz şokudur!)
  const compoundBearishPhrases: { phrase: string; weight: number }[] = [
    { phrase: 'interest rates surge', weight: -0.75 },
    { phrase: 'rates surge', weight: -0.70 },
    { phrase: 'yields surge', weight: -0.65 },
    { phrase: 'yields jump', weight: -0.60 },
    { phrase: 'inflation surges', weight: -0.70 },
    { phrase: 'inflation rises', weight: -0.55 },
    { phrase: 'capitulation wave', weight: -0.85 },
    { phrase: 'teslimiyet dalgası', weight: -0.85 },
    { phrase: '3-month low', weight: -0.75 },
    { phrase: 'en düşük seviye', weight: -0.75 },
    { phrase: 'falls to', weight: -0.65 },
    { phrase: 'fell to', weight: -0.65 },
    { phrase: 'slumps below', weight: -0.80 },
    { phrase: 'drops below', weight: -0.70 },
    { phrase: 'rate hike', weight: -0.60 },
    { phrase: 'resigns', weight: -0.65 },
  ];

  const compoundBullishPhrases: { phrase: string; weight: number }[] = [
    { phrase: 'rate cut', weight: 0.75 },
    { phrase: 'cuts rate', weight: 0.75 },
    { phrase: 'faiz indirimi', weight: 0.75 },
    { phrase: 'record high', weight: 0.75 },
    { phrase: 'all-time high', weight: 0.80 },
    { phrase: 'beats expectations', weight: 0.65 },
    { phrase: 'beats estimates', weight: 0.65 },
    { phrase: 'inflation cools', weight: 0.65 },
    { phrase: 'inflation eases', weight: 0.65 },
    { phrase: 'strong inflows', weight: 0.60 },
  ];

  for (const item of compoundBearishPhrases) {
    if (cleanedForSingleWords.includes(item.phrase)) {
      rawScore += item.weight;
      cleanedForSingleWords = cleanedForSingleWords.replace(item.phrase, ' ');
    }
  }
  for (const item of compoundBullishPhrases) {
    if (cleanedForSingleWords.includes(item.phrase)) {
      rawScore += item.weight;
      cleanedForSingleWords = cleanedForSingleWords.replace(item.phrase, ' ');
    }
  }

  // Tekil Bearish (Negatif / Satış Baskısı) Kelimeler
  const bearishWords = [
    'fall', 'falls', 'fell', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps',
    'tumble', 'tumbles', 'crash', 'crashes', 'sink', 'sinks', 'slide', 'slides',
    'decline', 'declines', 'low', 'lower', 'bearish', 'capitulation', 'selloff', 'sell-off',
    'crisis', 'war', 'tariff', 'probe', 'lawsuit', 'default', 'recession', 'fear',
    'weak', 'weaker', 'miss', 'misses', 'downgrade', 'warning', 'outflows', 'hawkish',
    'geriledi', 'düştü', 'düşüş', 'çakıldı', 'teslimiyet', 'kriz', 'satış baskısı', 'zarar', 'endişe',
  ];

  // Tekil Bullish (Pozitif / Alım İvmesi) Kelimeler
  const bullishWords = [
    'surge', 'surges', 'jump', 'jumps', 'rally', 'rallies', 'gain', 'gains',
    'rise', 'rises', 'rose', 'soar', 'soars', 'climb', 'climbs', 'rebound', 'rebounds',
    'bullish', 'record', 'beat', 'beats', 'upgrade', 'optimism', 'inflows', 'dovish',
    'recovery', 'strong', 'higher', 'boost', 'boosts', 'approval',
    'yükseldi', 'arttı', 'ralli', 'rekor', 'iyimserlik', 'güçlü', 'destek', 'toparlanma',
  ];

  for (const w of bearishWords) {
    if (matchesKeywordWithBoundary(cleanedForSingleWords, w)) rawScore -= 0.28;
  }
  for (const w of bullishWords) {
    if (matchesKeywordWithBoundary(cleanedForSingleWords, w)) rawScore += 0.28;
  }

  const sentimentScore = Math.max(-0.95, Math.min(0.95, +rawScore.toFixed(2)));
  const absScore = Math.abs(sentimentScore);

  let sentiment: 'POZİTİF' | 'NEGATİF' | 'NÖTR' = 'NÖTR';
  if (sentimentScore >= 0.2) sentiment = 'POZİTİF';
  else if (sentimentScore <= -0.2) sentiment = 'NEGATİF';

  const isHighImpact =
    isMacro ||
    absScore >= 0.55 ||
    rawCombined.includes('breaking') ||
    rawCombined.includes('capitulation') ||
    rawCombined.includes('slump') ||
    rawCombined.includes('plunge') ||
    rawCombined.includes('record');

  const impact: 'YÜKSEK' | 'ORTA' | 'DÜŞÜK' = isHighImpact ? 'YÜKSEK' : absScore >= 0.25 ? 'ORTA' : 'DÜŞÜK';

  return {
    sentiment,
    sentimentScore,
    impact,
    affectedAssets: affectedAssets.slice(0, 4),
    isMacro,
  };
}

// In-Memory Translation Cache & News Cache
const translationCache = new Map<string, string>();
let cachedNews: any[] = [];
let lastNewsFetchTime = 0;
const NEWS_CACHE_TTL = 60 * 1000; // 60 saniye tazeleme döngüsü

// Canlı USD/TRY Kur Önbelleği
let cachedUsdTryRate = 38.55;
let lastUsdTryFetchTime = 0;

export async function fetchLiveUsdTryRate(): Promise<number> {
  const now = Date.now();
  if (now - lastUsdTryFetchTime < 5 * 60 * 1000 && cachedUsdTryRate > 10) {
    return cachedUsdTryRate;
  }
  try {
    const data = await fetchReal1YearData('USD/TRY');
    if (data && data.price > 10) {
      cachedUsdTryRate = +data.price.toFixed(4);
      lastUsdTryFetchTime = now;
    }
  } catch {
    // Fallback to last known live rate
  }
  return cachedUsdTryRate;
}

export async function translateToTurkish(text: string): Promise<string> {
  if (!text || text.trim().length === 0) return '';
  const trimmed = text.trim();
  if (translationCache.has(trimmed)) {
    return translationCache.get(trimmed)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(trimmed)}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      },
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data: any = await resp.json();
      if (Array.isArray(data?.[0])) {
        const translated = data[0].map((item: any) => item[0]).join('').trim();
        if (translated) {
          translationCache.set(trimmed, translated);
          return translated;
        }
      }
    }
  } catch {
    // Çeviri servisi yanıt vermezse orijinal metin döner
  }

  return trimmed;
}

export async function fetchRealFinancialNews() {
  const now = Date.now();
  if (cachedNews.length > 0 && now - lastNewsFetchTime < NEWS_CACHE_TTL) {
    return cachedNews;
  }

  const allNews: any[] = [];
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  await Promise.allSettled(
    FINANCIAL_NEWS_FEEDS.map(async (feed) => {
      try {
        const resp = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (!resp.ok) return;

        const xml = await resp.text();
        const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

        for (const block of itemBlocks) {
          const titleM = block.match(/<title>([\s\S]*?)<\/title>/i);
          const linkM = block.match(/<link>([\s\S]*?)<\/link>/i);
          const descM = block.match(/<description>([\s\S]*?)<\/description>/i);
          const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
          if (!titleM || !pubM) continue;

          const rawTitle = cleanXml(titleM[1]);
          const rawLink = cleanXml(linkM?.[1] || '');
          const rawDesc = cleanXml(descM?.[1] || '');
          const pubDate = new Date(cleanXml(pubM[1]));
          const ageMs = now - pubDate.getTime();

          if (!isNaN(pubDate.getTime()) && ageMs >= 0 && ageMs <= ONE_DAY_MS) {
            // Çeviri öncesi ham İngilizce metin üzerinden finansal alaka ve duyarlılık analizi yap
            const nlp = analyzeFinancialHeadline(rawTitle, rawDesc, feed.source);
            if (!nlp) continue; // Magazin / seyahat / finans dışı haberleri eler

            allNews.push({
              id: `news-${feed.source.replace(/[\/\s]/g, '')}-${pubDate.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
              originalTitle: rawTitle,
              title: rawTitle,
              originalSummary: rawDesc.slice(0, 240),
              summary: rawDesc.slice(0, 240) + (rawDesc.length > 240 ? '...' : ''),
              source: feed.source,
              sourceUrl: rawLink,
              impact: nlp.impact,
              sentiment: nlp.sentiment,
              sentimentScore: nlp.sentimentScore,
              affectedAssets: nlp.affectedAssets,
              isMacro: nlp.isMacro,
              publishedAt: formatTimeAgo(pubDate),
              publishedTimestamp: pubDate.getTime(),
              read: false,
            });
          }
        }
      } catch {
        // Feed hata verirse diğer kaynaklar kesintisiz çalışmaya devam eder
      }
    })
  );

  allNews.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);
  const selectedNews = allNews.slice(0, 25);

  // Başlıkları ve Özetleri Türkçe Bilgilendirmeye Çevir + Türkçe Metinle NLP Skorunu Teyit Et
  await Promise.allSettled(
    selectedNews.map(async (n) => {
      try {
        const [trTitle, trSummary] = await Promise.all([
          translateToTurkish(n.title),
          translateToTurkish(n.summary),
        ]);
        if (trTitle) n.title = trTitle;
        if (trSummary) n.summary = trSummary;
        const refined = analyzeFinancialHeadline(n.originalTitle || '', n.originalSummary || '', n.source, n.title, n.summary);
        if (refined) {
          n.sentiment = refined.sentiment;
          n.sentimentScore = refined.sentimentScore;
          n.impact = refined.impact;
          n.affectedAssets = refined.affectedAssets;
        }
        // Yapay Zeka Nedensel Karar & Fırsat Analizini Üret
        const aiAnalysis = analyzeArticleWithAI({
          rawTitle: n.originalTitle || n.title || '',
          rawSummary: n.originalSummary || n.summary || '',
          trTitle: n.title || '',
          trSummary: n.summary || '',
          source: n.source || '',
          sentimentScore: n.sentimentScore ?? 0,
          affectedAssets: n.affectedAssets || [],
          isMacro: n.isMacro,
        });
        n.aiAnalysis = aiAnalysis;
        // AI'nın nedensel olarak tespit ettiği tüm varlıkları da habere bağla
        if (Array.isArray(aiAnalysis.assetImpacts)) {
          const merged = new Set([...(n.affectedAssets || []), ...aiAnalysis.assetImpacts.map((i) => i.symbol)]);
          n.affectedAssets = Array.from(merged).slice(0, 5);
        }
      } catch {
        // Hata durumunda orijinal başlık korunur
      }
    })
  );

  cachedNews = selectedNews;
  lastNewsFetchTime = now;
  return selectedNews;
}

function cleanXml(str: string): string {
  if (!str) return '';
  let cleaned = str
    // CDATA bloklarını temizle
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    // HTML taglerini temizle
    .replace(/<[^>]*>?/gm, ' ')
    // Standart HTML isimlendirilmiş varlıklar
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&hellip;/gi, '...')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"');

  // Hexadecimal kodlu karakterler (Örn: &#x201c;, &#x201d;, &#x2014;)
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return '';
    }
  });

  // Desimal kodlu karakterler (Örn: &#8216;, &#8217;, &#8220;, &#8221;)
  cleaned = cleaned.replace(/&#([0-9]+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return '';
    }
  });

  // Çift encode edilmiş olası durumlar için ikinci geçiş
  cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
  });
  cleaned = cleaned.replace(/&#([0-9]+);/g, (_, dec) => {
    try { return String.fromCharCode(parseInt(dec, 10)); } catch { return ''; }
  });

  return cleaned.replace(/\s+/g, ' ').trim();
}

function formatTimeAgo(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Az önce';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dakika önce`;
  const hours = Math.floor(diffSec / 3600);
  return `${hours} saat önce (Son 24s)`;
}

// Haber Duyarlılığı & Şok Faktörü Analiz Motoru
export interface NewsContext {
  sentimentScore: number; // -1.0 (aşırı negatif) ile +1.0 (aşırı pozitif)
  shockLevel: number; // 0.0 (sakin) ile 1.0 (yüksek şok/flaş haber)
  impactingHeadline: string;
  source: string;
  biasDescription: string;
  newsTimeAgo: string;
  newestTimestamp?: number;
  isRecapOnly?: boolean;
}

export function extractNewsSentimentForAsset(symbol: string, newsList: any[]): NewsContext {
  if (!newsList || newsList.length === 0) {
    return {
      sentimentScore: 0,
      shockLevel: 0,
      impactingHeadline: '',
      source: '',
      biasDescription: 'Haber akışı sakin; saf teknik model devrede.',
      newsTimeAgo: '',
      newestTimestamp: 0,
      isRecapOnly: false,
    };
  }

  // Yapay Zeka Çoklu Haber Sentezini Çalıştır
  const aiSynth = synthesizeAssetNewsAI(symbol, newsList);
  if (aiSynth.hasNews && aiSynth.primaryHeadline) {
    const absSent = Math.abs(aiSynth.netAiScore);
    const shockLevel = Math.min(1.0, +(0.25 + absSent * 0.70).toFixed(2));
    return {
      sentimentScore: aiSynth.netAiScore,
      shockLevel,
      impactingHeadline: aiSynth.primaryHeadline,
      source: aiSynth.primarySource,
      biasDescription: `${aiSynth.aiDecision} (%${aiSynth.convictionScore} Güven) — ${aiSynth.causalMechanism}`,
      newsTimeAgo: aiSynth.publishedAt,
      newestTimestamp: aiSynth.newestTimestamp,
      isRecapOnly: aiSynth.isRecapOnly,
    };
  }

  const assetKeys = ASSET_KEYWORD_MAP[symbol] || [symbol.toLowerCase().replace('/', '')];

  // Sadece gerçekten bu enstrümanla veya doğrudan küresel makro/Fed ile ilişkili haberleri filtrele
  let bestNews: any = null;
  let maxRelevance = 0;

  for (const n of newsList) {
    const rawText = `${n.originalTitle || ''} ${n.originalSummary || ''}`.toLowerCase();
    const fullText = `${rawText} ${n.title || ''} ${n.summary || ''}`.toLowerCase();
    let relevance = 0;

    if (Array.isArray(n.affectedAssets) && n.affectedAssets.includes(symbol)) {
      relevance += 5;
    }
    assetKeys.forEach((k) => {
      if (matchesKeywordWithBoundary(rawText, k) || (k.length > 5 && matchesKeywordWithBoundary(fullText, k))) {
        relevance += 3;
      }
    });
    if (n.isMacro) {
      relevance += 1;
    }

    if (relevance > maxRelevance) {
      maxRelevance = relevance;
      bestNews = n;
    }
  }

  // Enstrümanla alakalı hiçbir haber yoksa alakasız manşet atama!
  if (!bestNews || maxRelevance < 3) {
    return {
      sentimentScore: 0,
      shockLevel: 0,
      impactingHeadline: '',
      source: '',
      biasDescription: `${symbol} için son 24 saatte ters bir haber şoku yok; teknik rejim geçerli.`,
      newsTimeAgo: '',
    };
  }

  // NLP Duyarlılık Skorunu Al (Hem İngilizce hem Türkçe metin üzerinden)
  const nlp = analyzeFinancialHeadline(
    bestNews.originalTitle || bestNews.title || '',
    bestNews.originalSummary || bestNews.summary || '',
    bestNews.source || '',
    bestNews.title,
    bestNews.summary
  );

  let sentimentScore = typeof bestNews.sentimentScore === 'number'
    ? bestNews.sentimentScore
    : (nlp ? nlp.sentimentScore : 0);

  // Dolar Bazlı Ters Korelasyon Düzeltmesi (Örn: Faiz/Dolar şoku USD/JPY ve USD/TRY için yukarı yönlüdür)
  const rawLower = `${bestNews.originalTitle || ''} ${bestNews.originalSummary || ''}`.toLowerCase();
  if ((symbol === 'USD/JPY' || symbol === 'USD/TRY') && (rawLower.includes('rates surge') || rawLower.includes('yields surge') || rawLower.includes('strong dollar'))) {
    sentimentScore = Math.abs(sentimentScore);
  }

  const absSent = Math.abs(sentimentScore);
  const shockLevel = Math.min(1.0, +(0.25 + absSent * 0.65 + (bestNews.impact === 'YÜKSEK' ? 0.2 : 0)).toFixed(2));

  let biasDescription = 'Nötr piyasa haber akışı';
  if (sentimentScore >= 0.2) {
    biasDescription = `Pozitif Haber Desteği (+%${Math.round(sentimentScore * 100)} Alım İvmesi)`;
  } else if (sentimentScore <= -0.2) {
    biasDescription = `Negatif Haber Baskısı (-%${Math.round(absSent * 100)} Satış Riski)`;
  }

  return {
    sentimentScore,
    shockLevel,
    impactingHeadline: bestNews.title,
    source: bestNews.source,
    biasDescription,
    newsTimeAgo: bestNews.publishedAt,
    newestTimestamp: Number(bestNews.publishedTimestamp) || 0,
    isRecapOnly: /\b(falls to|fell to|drops to|slumps below|drops below|four-month low|3-month low|month low|crypto selloff|selloff deepens|bitcoin rallies|bitcoin surges)\b/i.test(rawLower),
  };
}

