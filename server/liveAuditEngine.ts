// server/liveAuditEngine.ts
// ZELTRA /canli — %100 GERÇEK ZAMANLI, İLERİ-DÖNÜK (FORWARD-ONLY) KİLİTLİ TAHMİN,
// KRONOLOJİK CORTEX v16.0 ÖZ-ÖĞRENEN YAPAY ZEKA & GERÇEKLEŞEN KÂR DEFTERİ

import fs from 'fs';
import path from 'path';
import {
  extractNewsSentimentForAsset,
  fetchCleanDailyHistory,
  fetchExtendedHourlyHistory,
  fetchLiveCryptoQuotes,
  fetchMacroPulse,
  fetchRealFinancialNews,
  type HourlyBar,
} from './marketService';
import {
  build12hIndicatorPack,
  build4hIndicatorPack,
  buildDailyIndicatorPack,
  evaluateZacAt,
  extract4hContextAt,
  ZAC_CRYPTO_ASSETS,
  ZAC_MR12_ASSETS,
  type ZacPodType,
} from './zeltraAlphaIndicator';
import {
  analyzeCandlestickAndMicrostructure,
  buildExpertVector,
  computeAdaptiveHorizonForecast,
  CORTEX_AI_VERSION,
  finalizePretrainedBrain,
  findLastClosedBarIndex,
  learnFromSettledForecast,
  loadOrInitAiBrain,
  resetAiBrain,
  type AiPostMortemReflection,
  type ExpertSignalVector,
  type InstitutionalCandlePattern,
  type ZeltraAiBrainState,
} from './zeltraSelfLearningAi';
import {
  controlAutonomousBot,
  CORE_SYMBOLS,
  getAutonomousLedgerSnapshot,
  getSpec,
  isMarketOpenForAsset,
  LIVE_GO_TARGET_ISO,
  runAutonomousBotTick,
  STRATEGY_VERSION,
} from './autonomousTrader';

const AUDIT_FILE = path.resolve(process.cwd(), 'data', 'live_forward_audit.json');
const AUDIT_SCHEMA_VERSION = 'live-forward-v3-cortex16';

export type ForecastHorizonH = 1 | 4 | 24;

export interface LockedForwardForecast {
  id: string;
  symbol: string;
  name: string;
  digits: number;
  horizonHours: ForecastHorizonH;
  lockedAtMs: number;
  lockedAtTR: string;
  targetAtMs: number;
  targetAtTR: string;
  baselinePrice: number;
  predictedPrice: number;
  predictedMovePct: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  confluenceTier?: 'SNIPER' | 'HIGH' | 'STANDARD' | 'CHOP';
  lower90: number;
  upper90: number;
  zacScore: number;
  pUp: number;
  activePod: ZacPodType;
  regimeLabelTR: string;
  expertsAtEntry?: ExpertSignalVector;
  patternAtEntry?: InstitutionalCandlePattern;
  patternLabelAtEntryTR?: string;
  vsaDetailTR?: string;
  structureLabelTR?: string;
  dominantExpertLabelTR?: string;
  aiReasoningTR?: string;
  er1hAtEntry?: number;
  volRatioAtEntry?: number;
  status: 'BEKLİYOR' | 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR';
  currentLivePrice: number;
  currentMovePct: number;
  actualPrice?: number;
  actualMovePct?: number;
  priceErrorPct?: number;
  directionHit?: boolean;
  inside90Band?: boolean;
  settledAtMs?: number;
  settledAtTR?: string;
  postMortem?: AiPostMortemReflection;
}

export interface LiveForwardAuditStore {
  schemaVersion: string;
  strategyVersion: string;
  cortexCalibrated?: boolean;
  cortexVersion?: string;
  startedAtMs: number;
  startedAtTR: string;
  lastUpdatedAtMs: number;
  lastUpdatedAtTR: string;
  forecasts: LockedForwardForecast[];
}

export interface LiveAuditHorizonStats {
  horizonHours: ForecastHorizonH;
  totalLocked: number;
  pending: number;
  settled: number;
  directionHits: number;
  directionHitRatePct: number;
  directionalSettledCount?: number;
  directionalWinRatePct?: number;
  band90Hits: number;
  band90CoveragePct: number;
  avgPriceErrorPct: number;
}

export interface LiveAuditDashboardPayload {
  schemaVersion: string;
  strategyVersion: string;
  generatedAt: string;
  startedAtTR: string;
  lastUpdatedAtTR: string;
  liveGoTargetTR: string;
  daysRemaining: number;
  zeroBacktestGuaranteeTR: string;
  portfolio: {
    isRunning: boolean;
    liveUsdTry: number;
    vixLevel: number;
    tickCount: number;
    lastTickAt: string;
    initialCapitalUSD: number;
    totalEquityUSD: number;
    cashBalanceUSD: number;
    availableCashUSD: number;
    allocatedMarginUSD: number;
    realizedPnL_USD: number;
    floatingPnL_USD: number;
    netProfitUSD: number;
    netProfitPercent: number;
    totalFeesAndSwapUSD: number;
    maxDrawdownPercent: number;
    openPositionsCount: number;
    closedTradesCount: number;
    winRatePercent: number;
    profitFactor: number;
    openPositions: any[];
    closedTrades: any[];
    equityHistory: { timestamp: number; timeStr: string; equityUSD: number; ddPct: number }[];
  };
  forecastSummary: {
    totalLocked: number;
    pendingCount: number;
    settledCount: number;
    directionHits: number;
    directionHitRatePct: number;
    highConvictionSettled: number;
    highConvictionHitRatePct: number;
    directionalSettledCount?: number;
    directionalWinRatePct?: number;
    directionalProfitFactor?: number;
    simulated1kDirectionalNetUSD?: number;
    band90CoveragePct: number;
    avgPriceErrorPct: number;
    byHorizon: LiveAuditHorizonStats[];
  };
  aiBrain: ZeltraAiBrainState;
  forecasts: LockedForwardForecast[];
}

let cachedStore: LiveForwardAuditStore | null = null;
let auditTickInFlight: Promise<LiveForwardAuditStore> | null = null;

function formatTR(ms: number): string {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function roundTo(val: number, digits: number): number {
  const f = Math.pow(10, Math.min(6, Math.max(0, digits)));
  return Math.round(val * f) / f;
}

function createFreshStore(nowMs = Date.now()): LiveForwardAuditStore {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    strategyVersion: STRATEGY_VERSION,
    cortexCalibrated: true,
    cortexVersion: CORTEX_AI_VERSION,
    startedAtMs: nowMs,
    startedAtTR: formatTR(nowMs),
    lastUpdatedAtMs: nowMs,
    lastUpdatedAtTR: formatTR(nowMs),
    forecasts: [],
  };
}

function saveStoreAtomic(store: LiveForwardAuditStore): void {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${AUDIT_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, AUDIT_FILE);
  } catch (err) {
    console.error('[ZELTRA /canli] Audit kayıt hatası:', err);
  }
}

// Eski v2 defterini koruyarak (>%16 bozuk kotasyon artefaktlarını ve 60sn çift kilit kopyalarını temizleyip) v3'e taşır!
function sanitizeLegacyForecasts(list: LockedForwardForecast[]): LockedForwardForecast[] {
  const asc = list
    .filter((f) => {
      if (!f || !f.symbol || !(f.baselinePrice > 0)) return false;
      if (f.status !== 'BEKLİYOR' && Math.abs(Number(f.actualMovePct || 0)) > 16.0) {
        return false; // Bozuk veri sağlayıcı kopukluğunu (örn. NVDA pre-sync +35%) ayıkla
      }
      return true;
    })
    .sort((a, b) => a.lockedAtMs - b.lockedAtMs);

  const deduped: LockedForwardForecast[] = [];
  const lastLockByKey = new Map<string, number>();
  for (const f of asc) {
    const key = `${f.symbol}:${f.horizonHours}`;
    const minGapMs = f.horizonHours === 1 ? 30 * 60_000 : f.horizonHours === 4 ? 90 * 60_000 : 4 * 3600_000;
    const prevTs = lastLockByKey.get(key) || 0;
    if (prevTs > 0 && f.lockedAtMs - prevTs < minGapMs) {
      continue; // 60sn arayla kilitlenmiş çift kayıt kopyasını temizle
    }
    lastLockByKey.set(key, f.lockedAtMs);
    deduped.push(f);
  }
  return deduped;
}

export function loadOrInitLiveAuditStore(): LiveForwardAuditStore {
  if (cachedStore) return cachedStore;
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8').replace(/^\uFEFF/, ''));
      if (
        parsed &&
        (parsed.schemaVersion === AUDIT_SCHEMA_VERSION || parsed.schemaVersion === 'live-forward-v2-cortex15') &&
        Array.isArray(parsed.forecasts)
      ) {
        const isUpgrade =
          parsed.schemaVersion !== AUDIT_SCHEMA_VERSION || parsed.cortexVersion !== CORTEX_AI_VERSION;
        cachedStore = {
          ...(parsed as LiveForwardAuditStore),
          schemaVersion: AUDIT_SCHEMA_VERSION,
          strategyVersion: STRATEGY_VERSION,
          cortexVersion: CORTEX_AI_VERSION,
          cortexCalibrated: isUpgrade ? false : Boolean(parsed.cortexCalibrated),
          forecasts: sanitizeLegacyForecasts(parsed.forecasts),
        };
        if (isUpgrade) saveStoreAtomic(cachedStore);
        return cachedStore;
      }
    }
  } catch {
    // Bozuk dosyada temiz başlat
  }
  cachedStore = createFreshStore();
  saveStoreAtomic(cachedStore);
  return cachedStore;
}

// Sıfır yanlılıklı (zero-bias) vade sonuçlandırma kuralı:
// Düz 0.000% hareket YÜKSELİŞ lehine bedava DOĞRU sayılmaz; YATAY_NÖTR olarak sınıflandırılır.
function evaluateSettledDirection(
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY',
  actualMovePct: number,
  inside90Band: boolean,
  horizonHours: ForecastHorizonH
): { status: 'DOĞRU' | 'YANLIŞ' | 'YATAY_NÖTR'; directionHit: boolean } {
  if (expectedDirection === 'YATAY') {
    const neutralMaxMove = horizonHours === 1 ? 0.45 : horizonHours === 4 ? 0.90 : 1.80;
    const hit = Boolean(inside90Band) && Math.abs(actualMovePct) <= neutralMaxMove;
    return { status: hit ? 'YATAY_NÖTR' : 'YANLIŞ', directionHit: hit };
  }
  if (Math.abs(actualMovePct) < 0.004) {
    return { status: 'YATAY_NÖTR', directionHit: false };
  }
  const hit = expectedDirection === 'YÜKSELİŞ' ? actualMovePct > 0 : actualMovePct < 0;
  return { status: hit ? 'DOĞRU' : 'YANLIŞ', directionHit: hit };
}

export async function resetLiveAuditStoreClean(): Promise<LiveAuditDashboardPayload> {
  resetAiBrain();

  // 17 varlığın son 30 günlük gerçek 1H/Daily barlarıyla 5-Uzman ağırlıklarını zaman-damgası eşleşmeli ön-eğit
  const assetData: { sym: string; h1: HourlyBar[]; daily: HourlyBar[] }[] = [];
  for (let i = 0; i < CORE_SYMBOLS.length; i += 6) {
    const batch = CORE_SYMBOLS.slice(i, i + 6);
    const res = await Promise.all(
      batch.map(async (sym) => {
        try {
          const [h1, daily] = await Promise.all([
            fetchExtendedHourlyHistory(sym, '90d'),
            fetchCleanDailyHistory(sym),
          ]);
          return { sym, h1, daily };
        } catch {
          return { sym, h1: [] as HourlyBar[], daily: [] as HourlyBar[] };
        }
      })
    );
    assetData.push(...res);
  }

  for (const { sym, h1, daily } of assetData) {
    if (h1.length < 250 || daily.length < 150) continue;
    const spec = getSpec(sym);
    const dPack = buildDailyIndicatorPack(daily);
    const p12 = build12hIndicatorPack(h1, sym);
    const p4 = build4hIndicatorPack(h1, sym);
    const startIdx = Math.max(80, h1.length - 260);
    let dpIdx = 0;
    let i12Idx = 0;

    for (let i = startIdx; i < h1.length - 26; i += 4) {
      const b = h1[i];
      const barCloseTs = b.endTimestamp ?? b.timestamp + 3600_000;
      if (!isMarketOpenForAsset(sym, barCloseTs).open) continue;

      while (
        dpIdx + 1 < dPack.bars.length &&
        (dPack.bars[dpIdx + 1].endTimestamp ?? dPack.bars[dpIdx + 1].timestamp + 86400000) <= barCloseTs
      ) {
        dpIdx++;
      }
      while (
        i12Idx + 1 < p12.bars.length &&
        (p12.bars[i12Idx + 1].endTimestamp ?? p12.bars[i12Idx + 1].timestamp + 12 * 3600000) <= barCloseTs
      ) {
        i12Idx++;
      }
      if (dpIdx < 60 || i12Idx < 10) continue;

      const micro = analyzeCandlestickAndMicrostructure(h1, spec.digits, i, { symbol: sym });
      const snap = evaluateZacAt(sym, spec.digits, b.close, dPack, dpIdx, p12, i12Idx, 18, 0, CORE_SYMBOLS.length);
      const h4Ctx = extract4hContextAt(p4, barCloseTs);
      const experts = buildExpertVector(
        snap.ewmac,
        snap.aboveSma200,
        snap.ibs12h,
        snap.cumRsi2_12h,
        snap.mom12hAtr,
        0,
        CORE_SYMBOLS.length,
        snap.volRatio,
        micro,
        ZAC_CRYPTO_ASSETS.has(sym),
        ZAC_MR12_ASSETS.has(sym),
        h4Ctx
      );

      for (const h of [1, 4, 24] as const) {
        const targetTs = barCloseTs + h * 3600_000;
        if (!isMarketOpenForAsset(sym, targetTs).open) continue;

        // Dizi indeksi (i + h) yerine GERÇEK HEDEF ZAMAN DAMGASI eşleştirmesi (ABD hisseleri hafta sonu kaymasını önler!)
        let matchBar: HourlyBar | null = null;
        for (let k = i + 1; k < h1.length; k++) {
          const kEnd = h1[k].endTimestamp ?? h1[k].timestamp + 3600_000;
          if (Math.abs(kEnd - targetTs) <= 45 * 60_000) {
            matchBar = h1[k];
            break;
          }
          if (kEnd > targetTs + 2 * 3600_000) break;
        }
        if (!matchBar) continue;

        const fc = computeAdaptiveHorizonForecast(
          h,
          b.close,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          snap.activeSetup.pod !== 'NONE',
          sym
        );
        const actualPx = matchBar.close;
        const actualMovePct = +(((actualPx - b.close) / b.close) * 100).toFixed(3);
        const inside90 = actualPx >= fc.lower90 && actualPx <= fc.upper90;
        const { directionHit } = evaluateSettledDirection(fc.expectedDirection, actualMovePct, inside90, h);

        learnFromSettledForecast({
          forecastId: 'PRETRAIN',
          symbol: sym,
          horizonHours: h,
          predictedDirection: fc.expectedDirection,
          predictedMovePct: fc.expectedMovePct,
          actualMovePct,
          inside90Band: inside90,
          directionHit,
          expertsAtEntry: experts,
          patternAtEntry: micro.pattern,
          patternLabelAtEntryTR: micro.patternLabelTR,
          er1hAtEntry: micro.er1h,
          volRatioAtEntry: snap.volRatio,
          settledAtMs: targetTs,
          skipSave: true,
        });
      }
    }
  }

  finalizePretrainedBrain();
  await controlAutonomousBot('reset');
  cachedStore = createFreshStore(Date.now());
  saveStoreAtomic(cachedStore);
  return getLiveAuditDashboard(true);
}

function findHistoricalPriceAtTarget(h1Bars: HourlyBar[], targetAtMs: number, fallbackLivePx: number): number {
  if (!h1Bars || h1Bars.length === 0) return fallbackLivePx;
  let bestBar = h1Bars[h1Bars.length - 1];
  let bestDiff = Infinity;
  for (const b of h1Bars) {
    const barEndMs = b.endTimestamp ?? b.timestamp + 3600 * 1000;
    const diff = Math.abs(barEndMs - targetAtMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBar = b;
    }
  }
  return bestDiff <= 2 * 3600 * 1000 ? bestBar.close : fallbackLivePx;
}

// Kilit anında YALNIZCA KAPANMIŞ olan son bar indeksini döndürür (retro-kalibrasyon look-ahead sızıntısını sıfırlar!)
function findClosedBarIndexAtTime(bars: HourlyBar[], targetMs: number, defaultDurMs: number, symbol = ''): number {
  return findLastClosedBarIndex(bars, targetMs, defaultDurMs, symbol);
}

// =========================================================================
// GERÇEK ZAMANLI TAHMİN KİLİTLEME, KRONOLOJİK DOĞRULAMA & CORTEX v16 ÖĞRENME
// =========================================================================
export async function runLiveAuditTick(forceLockOpenMarkets = false): Promise<LiveForwardAuditStore> {
  if (auditTickInFlight) return auditTickInFlight;

  const work = (async () => {
    const store = loadOrInitLiveAuditStore();
    const nowMs = Date.now();

    const [macro, cryptoQuotes, newsList] = await Promise.all([
      fetchMacroPulse().catch(() => null),
      fetchLiveCryptoQuotes().catch(() => ({} as Record<string, { mid: number; bid: number; ask: number }>)),
      fetchRealFinancialNews().catch(() => []),
    ]);
    const vixLevel = macro?.vixPrice && macro.vixPrice > 5 ? macro.vixPrice : 18.0;

    const allForecastSyms = new Set(store.forecasts.map((f) => f.symbol));
    const activeSymbols = CORE_SYMBOLS.filter(
      (s) => isMarketOpenForAsset(s, nowMs).open || allForecastSyms.has(s)
    );

    const livePriceMap = new Map<string, number>();
    const h1Map = new Map<string, HourlyBar[]>();
    const dailyMap = new Map<string, HourlyBar[]>();

    for (let i = 0; i < activeSymbols.length; i += 6) {
      const batch = activeSymbols.slice(i, i + 6);
      await Promise.all(
        batch.map(async (sym) => {
          try {
            const [h1, daily] = await Promise.all([
              fetchExtendedHourlyHistory(sym, '730d'),
              fetchCleanDailyHistory(sym),
            ]);
            if (h1.length > 0) h1Map.set(sym, h1);
            if (daily.length > 0) dailyMap.set(sym, daily);

            const kq = cryptoQuotes[sym];
            const px =
              kq && kq.mid > 0
                ? kq.mid
                : h1.length > 0
                  ? h1[h1.length - 1].close
                  : daily.length > 0
                    ? daily[daily.length - 1].close
                    : 0;
            if (px > 0) livePriceMap.set(sym, px);
          } catch {
            // Tek varlık hatası akışı durdurmaz
          }
        })
      );
    }

    // 1) RETROAKTİF KRONOLOJİK CORTEX v16 KALİBRASYONU (Sıfır Geleceğe Bakış!)
    const needsRetroCalibration =
      !store.cortexCalibrated ||
      store.cortexVersion !== CORTEX_AI_VERSION ||
      store.forecasts.some((f) => f.status !== 'BEKLİYOR' && !f.postMortem);

    if (needsRetroCalibration) {
      resetAiBrain();
      store.forecasts = sanitizeLegacyForecasts(store.forecasts);
      // KRONOLOJİK SIRALAMA: Vadesi önce dolan tahmin önce öğrenilir!
      const chronological = store.forecasts
        .filter((f) => f.status !== 'BEKLİYOR')
        .slice()
        .sort((a, b) => (a.targetAtMs || a.lockedAtMs) - (b.targetAtMs || b.lockedAtMs));

      for (const f of chronological) {
        const h1 = h1Map.get(f.symbol) || [];
        const daily = dailyMap.get(f.symbol) || [];
        const livePx = livePriceMap.get(f.symbol) || f.actualPrice || f.currentLivePrice;

        const wasDelayedBySleep =
          !f.settledAtMs || f.settledAtMs - f.targetAtMs > 30 * 60 * 1000;
        const trueTargetPx =
          wasDelayedBySleep && h1.length > 0
            ? roundTo(findHistoricalPriceAtTarget(h1, f.targetAtMs, f.actualPrice || livePx), f.digits)
            : roundTo(f.actualPrice || livePx, f.digits);

        f.actualPrice = trueTargetPx;
        f.currentLivePrice = trueTargetPx;
        f.actualMovePct =
          f.baselinePrice > 0
            ? +(((trueTargetPx - f.baselinePrice) / f.baselinePrice) * 100).toFixed(3)
            : 0;
        f.currentMovePct = f.actualMovePct;
        f.priceErrorPct =
          f.baselinePrice > 0
            ? +((Math.abs(trueTargetPx - f.predictedPrice) / f.baselinePrice) * 100).toFixed(3)
            : 0;
        f.inside90Band = trueTargetPx >= f.lower90 && trueTargetPx <= f.upper90;
        if (wasDelayedBySleep) {
          f.settledAtMs = f.targetAtMs;
          f.settledAtTR = formatTR(f.targetAtMs);
        }

        const evalRes = evaluateSettledDirection(
          f.expectedDirection,
          f.actualMovePct || 0,
          Boolean(f.inside90Band),
          f.horizonHours
        );
        f.status = evalRes.status;
        f.directionHit = evalRes.directionHit;

        // Kilit anında YALNIZCA KAPANMIŞ OLAN barlarla uzman vektörünü oluştur (sıfır look-ahead!)
        if (h1.length >= 30 && daily.length >= 60) {
          const closedH1Idx = findClosedBarIndexAtTime(h1, f.lockedAtMs, 3600_000, f.symbol);
          if (closedH1Idx >= 22) {
            const micro = analyzeCandlestickAndMicrostructure(h1, f.digits, closedH1Idx, {
              symbol: f.symbol,
              livePrice: f.baselinePrice,
            });
            const dPack = buildDailyIndicatorPack(daily);
            const h1UpToLock = h1.slice(0, closedH1Idx + 1);
            const p12 = build12hIndicatorPack(h1UpToLock, f.symbol);
            const p4 = build4hIndicatorPack(h1UpToLock, f.symbol);
            const dpIdx = findClosedBarIndexAtTime(dPack.bars, f.lockedAtMs, 86400_000, f.symbol);
            const i12Idx = findClosedBarIndexAtTime(p12.bars, f.lockedAtMs, 12 * 3600_000, f.symbol);
            const h4Ctx = extract4hContextAt(p4, f.lockedAtMs);
            const snapAtLock = evaluateZacAt(
              f.symbol,
              f.digits,
              f.baselinePrice,
              dPack,
              dpIdx,
              p12,
              i12Idx,
              vixLevel,
              0,
              CORE_SYMBOLS.length
            );
            f.expertsAtEntry = buildExpertVector(
              snapAtLock.ewmac,
              snapAtLock.aboveSma200,
              snapAtLock.ibs12h,
              snapAtLock.cumRsi2_12h,
              snapAtLock.mom12hAtr,
              0,
              CORE_SYMBOLS.length,
              snapAtLock.volRatio,
              micro,
              ZAC_CRYPTO_ASSETS.has(f.symbol),
              ZAC_MR12_ASSETS.has(f.symbol),
              h4Ctx
            );
            f.patternAtEntry = micro.pattern;
            f.patternLabelAtEntryTR = micro.patternLabelTR;
            f.vsaDetailTR = micro.vsaDetailTR;
            f.structureLabelTR = micro.structureLabelTR;
            f.er1hAtEntry = micro.er1h;
            f.volRatioAtEntry = snapAtLock.volRatio;
          }
        }

        const fallbackExperts: ExpertSignalVector = f.expertsAtEntry || {
          E1_MACRO_TREND: f.zacScore,
          E2_MICRO_DISPLACEMENT: Math.round(f.zacScore * 0.4),
          E3_MEAN_REV_SPRING: Math.round(f.zacScore * 0.3),
          E4_CANDLE_VSA_SWEEP: 0,
          E5_XSMOM_REGIME: Math.round(f.zacScore * 0.3),
        };

        f.postMortem = learnFromSettledForecast({
          forecastId: f.id,
          symbol: f.symbol,
          horizonHours: f.horizonHours,
          predictedDirection: f.expectedDirection,
          predictedMovePct: f.predictedMovePct,
          actualMovePct: f.actualMovePct || 0,
          inside90Band: Boolean(f.inside90Band),
          directionHit: Boolean(f.directionHit),
          expertsAtEntry: fallbackExperts,
          patternAtEntry: f.patternAtEntry || 'STANDARD_FLOW',
          patternLabelAtEntryTR: f.patternLabelAtEntryTR || 'Standart Kapanmış Mum Akışı',
          er1hAtEntry: f.er1hAtEntry ?? 0.22,
          volRatioAtEntry: f.volRatioAtEntry ?? 1.05,
          settledAtMs: f.settledAtMs || f.targetAtMs,
          skipSave: true,
        });
      }
      // Tüm kronolojik geçmiş işlendikten sonra tek seferde diske kaydet
      const finalBrain = loadOrInitAiBrain();
      fs.writeFileSync(`${path.resolve(process.cwd(), 'data', 'zeltra_ai_brain.json')}`, JSON.stringify(finalBrain, null, 2), 'utf-8');
      store.cortexCalibrated = true;
      store.cortexVersion = CORTEX_AI_VERSION;
    }

    // 2) BEKLEYEN tahminlerin canlı fiyatını güncelle; vadesi dolanları ESKİDEN YENİYE KRONOLOJİK SIRAYLA sonuçlandır!
    const expiredPending: LockedForwardForecast[] = [];
    for (const f of store.forecasts) {
      if (f.status !== 'BEKLİYOR') continue;
      const livePx = livePriceMap.get(f.symbol);
      if (!livePx || !(livePx > 0)) continue;

      const roundedLive = roundTo(livePx, f.digits);
      f.currentLivePrice = roundedLive;
      f.currentMovePct =
        f.baselinePrice > 0 ? +(((roundedLive - f.baselinePrice) / f.baselinePrice) * 100).toFixed(3) : 0;

      if (nowMs >= f.targetAtMs) {
        expiredPending.push(f);
      }
    }

    // KRİTİK DÜZELTME: Aynı anda birden fazla tahminin vadesi dolduğunda en eskiden en yeniye doğru öğren!
    expiredPending.sort((a, b) => a.targetAtMs - b.targetAtMs);
    for (const f of expiredPending) {
      const h1 = h1Map.get(f.symbol) || [];
      const roundedLive = f.currentLivePrice;
      const settlePx =
        nowMs - f.targetAtMs > 20 * 60 * 1000 && h1.length > 0
          ? roundTo(findHistoricalPriceAtTarget(h1, f.targetAtMs, roundedLive), f.digits)
          : roundedLive;

      f.actualPrice = settlePx;
      f.actualMovePct =
        f.baselinePrice > 0 ? +(((settlePx - f.baselinePrice) / f.baselinePrice) * 100).toFixed(3) : 0;
      f.currentMovePct = f.actualMovePct;
      f.priceErrorPct =
        f.baselinePrice > 0
          ? +((Math.abs(settlePx - f.predictedPrice) / f.baselinePrice) * 100).toFixed(3)
          : 0;
      f.inside90Band = settlePx >= f.lower90 && settlePx <= f.upper90;
      const effectiveSettleMs = nowMs - f.targetAtMs > 25 * 60 * 1000 ? f.targetAtMs : nowMs;
      f.settledAtMs = effectiveSettleMs;
      f.settledAtTR = formatTR(effectiveSettleMs);

      const evalRes = evaluateSettledDirection(
        f.expectedDirection,
        f.actualMovePct,
        f.inside90Band,
        f.horizonHours
      );
      f.status = evalRes.status;
      f.directionHit = evalRes.directionHit;

      const fallbackExperts: ExpertSignalVector = f.expertsAtEntry || {
        E1_MACRO_TREND: f.zacScore,
        E2_MICRO_DISPLACEMENT: Math.round(f.zacScore * 0.4),
        E3_MEAN_REV_SPRING: Math.round(f.zacScore * 0.3),
        E4_CANDLE_VSA_SWEEP: 0,
        E5_XSMOM_REGIME: Math.round(f.zacScore * 0.3),
      };
      f.postMortem = learnFromSettledForecast({
        forecastId: f.id,
        symbol: f.symbol,
        horizonHours: f.horizonHours,
        predictedDirection: f.expectedDirection,
        predictedMovePct: f.predictedMovePct,
        actualMovePct: f.actualMovePct,
        inside90Band: f.inside90Band,
        directionHit: f.directionHit,
        expertsAtEntry: fallbackExperts,
        patternAtEntry: f.patternAtEntry || 'STANDARD_FLOW',
        patternLabelAtEntryTR: f.patternLabelAtEntryTR || 'Standart Kapanmış Mum Akışı',
        er1hAtEntry: f.er1hAtEntry ?? 0.22,
        volRatioAtEntry: f.volRatioAtEntry ?? 1.05,
        settledAtMs: effectiveSettleMs,
      });
    }

    // 3) Açık piyasalarda CORTEX v16.0 Kapanmış-Mum + Çok-Ölçekli + Haber Katalizörlü yeni tahminler kilitle!
    const ledger = getAutonomousLedgerSnapshot();
    const radarMap = new Map((ledger.lastMarketRadar || []).map((r) => [r.symbol, r]));
    const horizonsToLock: { h: ForecastHorizonH; cooldownMs: number }[] = [
      { h: 1, cooldownMs: 55 * 60 * 1000 },
      { h: 4, cooldownMs: 3.8 * 3600 * 1000 },
      { h: 24, cooldownMs: 11.5 * 3600 * 1000 },
    ];

    for (const sym of CORE_SYMBOLS) {
      if (!isMarketOpenForAsset(sym, nowMs).open) continue;
      const h1 = h1Map.get(sym);
      const daily = dailyMap.get(sym);
      const livePx = livePriceMap.get(sym);
      if (!h1 || h1.length < 40 || !daily || daily.length < 60 || !livePx) continue;

      const spec = getSpec(sym);
      const dPack = buildDailyIndicatorPack(daily);
      const p12 = build12hIndicatorPack(h1, sym);
      const p4 = build4hIndicatorPack(h1, sym);

      const completedDailyIdx = findClosedBarIndexAtTime(dPack.bars, nowMs, 86400_000, sym);
      const completed12Idx = findClosedBarIndexAtTime(p12.bars, nowMs, 12 * 3600_000, sym);
      const h4Ctx = extract4hContextAt(p4, nowMs);
      const newsCtx = extractNewsSentimentForAsset(sym, newsList);

      const snap = evaluateZacAt(
        sym,
        spec.digits,
        livePx,
        dPack,
        completedDailyIdx,
        p12,
        completed12Idx,
        vixLevel,
        radarMap.get(sym)?.xsmomRank || 0,
        CORE_SYMBOLS.length
      );

      // Kapanmış son 1H mumu + canlı fiyat uzanımı ile gerçek SMC / Mum Anatomisi Analizi!
      const micro = analyzeCandlestickAndMicrostructure(h1, spec.digits, undefined, {
        nowMs,
        symbol: sym,
        barDurationMs: 3600_000,
        livePrice: livePx,
      });

      const experts = buildExpertVector(
        snap.ewmac,
        snap.aboveSma200,
        snap.ibs12h,
        snap.cumRsi2_12h,
        snap.mom12hAtr,
        snap.xsmomRank,
        CORE_SYMBOLS.length,
        snap.volRatio,
        micro,
        ZAC_CRYPTO_ASSETS.has(sym),
        ZAC_MR12_ASSETS.has(sym),
        {
          ...h4Ctx,
          newsContext: newsCtx,
          dxyChg15mPct: macro?.dxyChg15mPct,
          vixChg5mPct: macro?.vixChg5mPct,
        }
      );

      for (const { h, cooldownMs } of horizonsToLock) {
        const targetAtMs = nowMs + h * 3600 * 1000;
        // Borsa kapanış ölü bölgesine (örn. Cuma 21:40 UTC veya NYSE 15:50 ET) düşen tahminleri kilitleme!
        if (!isMarketOpenForAsset(sym, targetAtMs).open) continue;

        // KRİTİK DÜZELTME: Sıralamadan bağımsız olarak aktif BEKLİYOR kaydı veya en son kilit zamanını kontrol et!
        let hasPendingSame = false;
        let maxLockedAtMs = 0;
        for (const x of store.forecasts) {
          if (x.symbol === sym && x.horizonHours === h) {
            if (x.status === 'BEKLİYOR') hasPendingSame = true;
            if (x.lockedAtMs > maxLockedAtMs) maxLockedAtMs = x.lockedAtMs;
          }
        }
        if (hasPendingSame) continue;

        const needLock =
          maxLockedAtMs === 0 ||
          nowMs - maxLockedAtMs >= cooldownMs ||
          (forceLockOpenMarkets && nowMs - maxLockedAtMs >= 15 * 60 * 1000);

        if (!needLock) continue;

        const adaptive = computeAdaptiveHorizonForecast(
          h,
          livePx,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          snap.activeSetup.pod !== 'NONE',
          sym,
          newsCtx
        );

        const lockedRec: LockedForwardForecast = {
          id: `LF-${nowMs}-${sym.replace(/[^A-Z0-9]/g, '')}-${h}H`,
          symbol: sym,
          name: spec.name,
          digits: spec.digits,
          horizonHours: h,
          lockedAtMs: nowMs,
          lockedAtTR: formatTR(nowMs),
          targetAtMs,
          targetAtTR: formatTR(targetAtMs),
          baselinePrice: roundTo(livePx, spec.digits),
          predictedPrice: adaptive.expectedPrice,
          predictedMovePct: adaptive.expectedMovePct,
          expectedDirection: adaptive.expectedDirection,
          confluenceTier: adaptive.confluenceTier,
          lower90: adaptive.lower90,
          upper90: adaptive.upper90,
          zacScore: adaptive.compositeScore,
          pUp: adaptive.pUp,
          activePod: snap.activeSetup.pod,
          regimeLabelTR: snap.regimeLabelTR,
          expertsAtEntry: experts,
          patternAtEntry: micro.pattern,
          patternLabelAtEntryTR: micro.patternLabelTR,
          vsaDetailTR: micro.vsaDetailTR,
          structureLabelTR: micro.structureLabelTR,
          dominantExpertLabelTR: adaptive.dominantExpertLabelTR,
          aiReasoningTR: adaptive.aiReasoningTR,
          er1hAtEntry: micro.er1h,
          volRatioAtEntry: snap.volRatio,
          status: 'BEKLİYOR',
          currentLivePrice: roundTo(livePx, spec.digits),
          currentMovePct: 0,
        };
        store.forecasts.unshift(lockedRec);
      }
    }

    const f1 = store.forecasts.filter((x) => x.horizonHours === 1).slice(0, 260);
    const f4 = store.forecasts.filter((x) => x.horizonHours === 4).slice(0, 140);
    const f24 = store.forecasts.filter((x) => x.horizonHours === 24).slice(0, 100);
    store.forecasts = [...f1, ...f4, ...f24].sort(
      (a, b) => (b.settledAtMs || b.lockedAtMs) - (a.settledAtMs || a.lockedAtMs)
    );

    store.lastUpdatedAtMs = nowMs;
    store.lastUpdatedAtTR = formatTR(nowMs);
    saveStoreAtomic(store);
    return store;
  })();

  auditTickInFlight = work;
  try {
    return await work;
  } finally {
    auditTickInFlight = null;
  }
}

export async function getLiveAuditDashboard(syncNow = false): Promise<LiveAuditDashboardPayload> {
  const cur = loadOrInitLiveAuditStore();
  const nowCheck = Date.now();
  const hasExpiredPending = cur.forecasts.some(
    (f) => f.status === 'BEKLİYOR' && nowCheck >= f.targetAtMs
  );

  if (
    syncNow ||
    !cur.cortexCalibrated ||
    cur.cortexVersion !== CORTEX_AI_VERSION ||
    cur.forecasts.length === 0 ||
    hasExpiredPending ||
    nowCheck - cur.lastUpdatedAtMs > 55 * 1000
  ) {
    // Önce tahmin defterini mühürle/sonuçlandır, ardından otonom fonu taze mühürlerle çalıştır!
    await runLiveAuditTick(syncNow).catch(() => {});
    if (syncNow) {
      await runAutonomousBotTick(true).catch(() => {});
    }
  }

  const store = loadOrInitLiveAuditStore();
  const ledger = getAutonomousLedgerSnapshot();
  const aiBrain = loadOrInitAiBrain();

  const all = store.forecasts;
  const pending = all.filter((f) => f.status === 'BEKLİYOR');
  const settledAll = all.filter((f) => f.status !== 'BEKLİYOR');
  const isForecastHit = (f: LockedForwardForecast) =>
    f.status === 'DOĞRU' || (f.status === 'YATAY_NÖTR' && f.directionHit !== false);
  const dirHits = settledAll.filter(isForecastHit).length;
  const directionalOnly = settledAll.filter(
    (f) => f.expectedDirection === 'YÜKSELİŞ' || f.expectedDirection === 'DÜŞÜŞ'
  );
  const directionalHits = directionalOnly.filter((f) => f.status === 'DOĞRU').length;
  const hcSettled = settledAll.filter(
    (f) =>
      (f.expectedDirection === 'YÜKSELİŞ' || f.expectedDirection === 'DÜŞÜŞ') &&
      (Math.abs(f.zacScore) >= 18 || f.activePod !== 'NONE' || f.confluenceTier === 'SNIPER' || f.confluenceTier === 'HIGH')
  );
  const hcHits = hcSettled.filter((f) => f.status === 'DOĞRU').length;

  let grossWinPct = 0;
  let grossLossPct = 0;
  let simNetUSD = 0;
  for (const f of directionalOnly) {
    if (Math.abs(f.actualMovePct || 0) > 16.0) continue;
    const sign = f.expectedDirection === 'YÜKSELİŞ' ? 1 : -1;
    const retPct = sign * (f.actualMovePct || 0);
    const costPct = ZAC_CRYPTO_ASSETS.has(f.symbol) ? 0.04 : 0.015;
    const netPct = retPct - costPct;
    if (retPct > 0) grossWinPct += retPct;
    else if (retPct < 0) grossLossPct += Math.abs(retPct);
    // $25,000 USD IBKR hesabında işlem başı %10 ($2,500) referans spot tahsis karşılığı
    simNetUSD += 2_500 * (netPct / 100);
  }
  const directionalProfitFactor =
    grossLossPct > 0 ? +(grossWinPct / grossLossPct).toFixed(2) : grossWinPct > 0 ? 9.99 : 0;
  const simulated1kDirectionalNetUSD = +simNetUSD.toFixed(2);
  const bandHits = settledAll.filter((f) => f.inside90Band).length;
  const avgErr =
    settledAll.length > 0
      ? +(settledAll.reduce((s, f) => s + (f.priceErrorPct || 0), 0) / settledAll.length).toFixed(3)
      : 0;

  const byHorizon: LiveAuditHorizonStats[] = ([1, 4, 24] as const).map((h) => {
    const sub = all.filter((f) => f.horizonHours === h);
    const subPending = sub.filter((f) => f.status === 'BEKLİYOR');
    const subSettledAll = sub.filter((f) => f.status !== 'BEKLİYOR');
    const subDirHits = subSettledAll.filter(isForecastHit).length;
    const subDirectional = subSettledAll.filter(
      (f) => f.expectedDirection === 'YÜKSELİŞ' || f.expectedDirection === 'DÜŞÜŞ'
    );
    const subDirectionalHits = subDirectional.filter((f) => f.status === 'DOĞRU').length;
    const subBandHits = subSettledAll.filter((f) => f.inside90Band).length;
    const subErr =
      subSettledAll.length > 0
        ? +(subSettledAll.reduce((s, f) => s + (f.priceErrorPct || 0), 0) / subSettledAll.length).toFixed(3)
        : 0;
    return {
      horizonHours: h,
      totalLocked: sub.length,
      pending: subPending.length,
      settled: subSettledAll.length,
      directionHits: subDirHits,
      directionHitRatePct: subSettledAll.length > 0 ? +((subDirHits / subSettledAll.length) * 100).toFixed(1) : 0,
      directionalSettledCount: subDirectional.length,
      directionalWinRatePct:
        subDirectional.length > 0 ? +((subDirectionalHits / subDirectional.length) * 100).toFixed(1) : 0,
      band90Hits: subBandHits,
      band90CoveragePct: subSettledAll.length > 0 ? +((subBandHits / subSettledAll.length) * 100).toFixed(1) : 0,
      avgPriceErrorPct: subErr,
    };
  });

  const realizedPnL = ledger.closedTrades.reduce((s, t) => s + (t.realizedPnL_USD || 0), 0);
  const msRem = Math.max(0, new Date(LIVE_GO_TARGET_ISO).getTime() - Date.now());
  const daysRemaining = Math.ceil(msRem / (86400 * 1000));

  return {
    schemaVersion: store.schemaVersion,
    strategyVersion: STRATEGY_VERSION,
    generatedAt: new Date().toISOString(),
    startedAtTR: store.startedAtTR,
    lastUpdatedAtTR: store.lastUpdatedAtTR,
    liveGoTargetTR: '01.12.2026',
    daysRemaining,
    zeroBacktestGuaranteeTR:
      'Bu sayfada HİÇBİR geçmiş simülasyon (backtest) yoktur. Tüm tahminler hedef saat gelmeden önce Kapanmış-Mum SMC & 5-Uzmanlı Cortex v16.0 Yapay Zekası tarafından mühürlenir; vade dolduğunda kronolojik kök-neden analiziyle ağırlıklar güncellenir.',
    portfolio: {
      isRunning: ledger.isRunning,
      liveUsdTry: ledger.liveUsdTry,
      vixLevel: ledger.vixLevel ?? 18,
      tickCount: ledger.tickCount ?? 0,
      lastTickAt: ledger.lastTickAt,
      initialCapitalUSD: ledger.initialCapitalUSD,
      totalEquityUSD: ledger.totalEquityUSD,
      cashBalanceUSD: ledger.cashBalanceUSD,
      availableCashUSD: ledger.availableCashUSD,
      allocatedMarginUSD: ledger.allocatedMarginUSD,
      realizedPnL_USD: +realizedPnL.toFixed(2),
      floatingPnL_USD: ledger.openFloatingPnL_USD,
      netProfitUSD: ledger.netProfitUSD,
      netProfitPercent: ledger.netProfitPercent,
      totalFeesAndSwapUSD: +(
        (ledger.metrics.totalSpreadAndCommissionUSD || 0) + (ledger.metrics.totalFinancingUSD || 0)
      ).toFixed(2),
      maxDrawdownPercent: ledger.metrics.maxDrawdownPercent,
      openPositionsCount: ledger.openPositions.length,
      closedTradesCount: ledger.closedTrades.length,
      winRatePercent: ledger.metrics.winRatePercent,
      profitFactor: ledger.metrics.profitFactor,
      openPositions: ledger.openPositions,
      closedTrades: ledger.closedTrades,
      equityHistory: ledger.equityHistory || [],
    },
    forecastSummary: {
      totalLocked: all.length,
      pendingCount: pending.length,
      settledCount: settledAll.length,
      directionHits: dirHits,
      directionHitRatePct:
        settledAll.length > 0 ? +((dirHits / settledAll.length) * 100).toFixed(1) : 0,
      highConvictionSettled: hcSettled.length,
      highConvictionHitRatePct:
        hcSettled.length > 0 ? +((hcHits / hcSettled.length) * 100).toFixed(1) : 0,
      directionalSettledCount: directionalOnly.length,
      directionalWinRatePct:
        directionalOnly.length > 0 ? +((directionalHits / directionalOnly.length) * 100).toFixed(1) : 0,
      directionalProfitFactor,
      simulated1kDirectionalNetUSD,
      band90CoveragePct: settledAll.length > 0 ? +((bandHits / settledAll.length) * 100).toFixed(1) : 0,
      avgPriceErrorPct: avgErr,
      byHorizon,
    },
    aiBrain,
    forecasts: [
      ...all.filter((x) => x.horizonHours === 24).slice(0, 80),
      ...all.filter((x) => x.horizonHours === 4).slice(0, 100),
      ...all.filter((x) => x.horizonHours === 1).slice(0, 180),
    ].sort((a, b) => (b.settledAtMs || b.lockedAtMs) - (a.settledAtMs || a.lockedAtMs)),
  };
}
