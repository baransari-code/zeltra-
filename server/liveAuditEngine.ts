// server/liveAuditEngine.ts
// ZELTRA /canli — %100 GERÇEK ZAMANLI, İLERİ-DÖNÜK (FORWARD-ONLY) KİLİTLİ TAHMİN,
// ÖZ-ÖĞRENEN YAPAY ZEKA (CORTEX v15.0) & GERÇEKLEŞEN KÂR DEFTERİ

import fs from 'fs';
import path from 'path';
import {
  fetchCleanDailyHistory,
  fetchExtendedHourlyHistory,
  fetchLiveCryptoQuotes,
  fetchMacroPulse,
  type HourlyBar,
} from './marketService';
import {
  build12hIndicatorPack,
  buildDailyIndicatorPack,
  evaluateZacAt,
  ZAC_CRYPTO_ASSETS,
  ZAC_MR12_ASSETS,
  type ZacPodType,
} from './zeltraAlphaIndicator';
import {
  analyzeCandlestickAndMicrostructure,
  buildExpertVector,
  computeAdaptiveHorizonForecast,
  finalizePretrainedBrain,
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
const AUDIT_SCHEMA_VERSION = 'live-forward-v2-cortex15';

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
  lower90: number;
  upper90: number;
  zacScore: number;
  pUp: number;
  activePod: ZacPodType;
  regimeLabelTR: string;
  // Cortex v15.0 5-Uzman & Mum Mikroyapı Kayıtları:
  expertsAtEntry?: ExpertSignalVector;
  patternAtEntry?: InstitutionalCandlePattern;
  patternLabelAtEntryTR?: string;
  vsaDetailTR?: string;
  structureLabelTR?: string;
  dominantExpertLabelTR?: string;
  aiReasoningTR?: string;
  er1hAtEntry?: number;
  volRatioAtEntry?: number;
  // Sonuçlandırma & Öz-Eleştiri (Post-Mortem):
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
    initialCapitalTRY: number;
    totalEquityTRY: number;
    cashBalanceTRY: number;
    availableCashTRY: number;
    allocatedMarginTRY: number;
    realizedPnL_TRY: number;
    floatingPnL_TRY: number;
    netProfitTRY: number;
    netProfitPercent: number;
    totalFeesAndSwapTRY: number;
    maxDrawdownPercent: number;
    openPositionsCount: number;
    closedTradesCount: number;
    winRatePercent: number;
    profitFactor: number;
    openPositions: any[];
    closedTrades: any[];
    equityHistory: { timestamp: number; timeStr: string; equityTRY: number; ddPct: number }[];
  };
  forecastSummary: {
    totalLocked: number;
    pendingCount: number;
    settledCount: number;
    directionHits: number;
    directionHitRatePct: number;
    highConvictionSettled: number;
    highConvictionHitRatePct: number;
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

export function loadOrInitLiveAuditStore(): LiveForwardAuditStore {
  if (cachedStore) return cachedStore;
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8').replace(/^\uFEFF/, ''));
      if (parsed && parsed.schemaVersion === AUDIT_SCHEMA_VERSION && Array.isArray(parsed.forecasts)) {
        cachedStore = parsed as LiveForwardAuditStore;
        return cachedStore;
      }
    }
  } catch {
    // Re-init on corrupt file
  }
  cachedStore = createFreshStore();
  saveStoreAtomic(cachedStore);
  return cachedStore;
}

export async function resetLiveAuditStoreClean(): Promise<LiveAuditDashboardPayload> {
  resetAiBrain();

  // 17 varlığın son 14 günlük gerçek 1H/Daily barlarını paralel çekip 5-Uzman ağırlıklarını ön-eğit
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
    const p12 = build12hIndicatorPack(h1);
    const startIdx = Math.max(60, h1.length - 200);
    let dpIdx = 0;
    let i12Idx = 0;

    for (let i = startIdx; i < h1.length - 24; i += 4) {
      const b = h1[i];
      while (dpIdx + 1 < dPack.bars.length && dPack.bars[dpIdx + 1].timestamp + 86400000 <= b.timestamp) dpIdx++;
      while (i12Idx + 1 < p12.bars.length && p12.bars[i12Idx + 1].timestamp + 12 * 3600000 <= b.timestamp) i12Idx++;
      if (dpIdx < 60 || i12Idx < 5) continue;

      const micro = analyzeCandlestickAndMicrostructure(h1, spec.digits, i);
      const snap = evaluateZacAt(sym, spec.digits, b.close, dPack, dpIdx, p12, i12Idx, 20, 0, CORE_SYMBOLS.length);
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
        ZAC_MR12_ASSETS.has(sym)
      );

      for (const h of [1, 4, 24] as const) {
        if (i + h >= h1.length) continue;
        const fc = computeAdaptiveHorizonForecast(
          h,
          b.close,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          snap.activeSetup.pod !== 'NONE'
        );
        const actualPx = h1[i + h].close;
        const actualMovePct = +(((actualPx - b.close) / b.close) * 100).toFixed(3);
        const inside90 = actualPx >= fc.lower90 && actualPx <= fc.upper90;
        const dirHit =
          fc.expectedDirection === 'YATAY'
            ? inside90
            : fc.expectedDirection === 'YÜKSELİŞ'
              ? actualPx >= b.close
              : actualPx <= b.close;

        learnFromSettledForecast({
          forecastId: 'PRETRAIN',
          symbol: sym,
          horizonHours: h,
          predictedDirection: fc.expectedDirection,
          predictedMovePct: fc.expectedMovePct,
          actualMovePct,
          inside90Band: inside90,
          directionHit: dirHit,
          expertsAtEntry: experts,
          patternAtEntry: micro.pattern,
          patternLabelAtEntryTR: micro.patternLabelTR,
          er1hAtEntry: micro.er1h,
          volRatioAtEntry: snap.volRatio,
          settledAtMs: h1[i + h].timestamp,
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

// Hedef zamanı geçmiş bir tahmin için o hedef saate en yakın gerçek 1H kapanış fiyatını bulur
function findHistoricalPriceAtTarget(h1Bars: HourlyBar[], targetAtMs: number, fallbackLivePx: number): number {
  if (!h1Bars || h1Bars.length === 0) return fallbackLivePx;
  let bestBar = h1Bars[h1Bars.length - 1];
  let bestDiff = Infinity;
  for (const b of h1Bars) {
    // 1H bar timestamp [T, T+1h) aralığındadır; barın sonu T + 3600_000'dir
    const barEndMs = b.timestamp + 3600 * 1000;
    const diff = Math.abs(barEndMs - targetAtMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBar = b;
    }
  }
  return bestDiff <= 2 * 3600 * 1000 ? bestBar.close : fallbackLivePx;
}

function findBarIndexAtTime(bars: HourlyBar[], targetMs: number): number {
  if (!bars || bars.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].timestamp <= targetMs) idx = i;
    else break;
  }
  return idx;
}

// =========================================================================
// GERÇEK ZAMANLI TAHMİN KİLİTLEME, DOĞRULAMA & CORTEX v15 ÖZ-ÖĞRENME DÖNGÜSÜ
// =========================================================================
export async function runLiveAuditTick(forceLockOpenMarkets = false): Promise<LiveForwardAuditStore> {
  if (auditTickInFlight) return auditTickInFlight;

  const work = (async () => {
    const store = loadOrInitLiveAuditStore();
    const nowMs = Date.now();

    const [macro, cryptoQuotes] = await Promise.all([
      fetchMacroPulse().catch(() => null),
      fetchLiveCryptoQuotes().catch(() => ({} as Record<string, { mid: number; bid: number; ask: number }>)),
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

    // 1) RETROAKTİF KENDİ-ONARIM & İLK CORTEX v15 KALİBRASYONU:
    // Daha önce Render uykusu yüzünden 14 saat gecikmeli kapanmış veya henüz post-mortem analizi yapılmamış
    // geçmiş sonuçlanan kayıtları gerçek hedef saat mumuyla düzeltip kronolojik olarak yapay zeka beynine öğret!
    const needsRetroCalibration =
      !store.cortexCalibrated ||
      store.forecasts.some((f) => f.status !== 'BEKLİYOR' && !f.postMortem);

    if (needsRetroCalibration) {
      resetAiBrain();
      // En eskiden en yeniye doğru sırala ki öğrenme kronolojik olsun
      const chronological = store.forecasts
        .slice()
        .sort((a, b) => a.lockedAtMs - b.lockedAtMs);

      for (const f of chronological) {
        if (f.status === 'BEKLİYOR') continue;
        const h1 = h1Map.get(f.symbol) || [];
        const daily = dailyMap.get(f.symbol) || [];
        const livePx = livePriceMap.get(f.symbol) || f.actualPrice || f.currentLivePrice;

        // Eğer kapanış hedef saatten >35 dk geç gerçekleştiyse (örn. sabahki 03:54 -> 18:55 uyku kayması),
        // tam hedef saatteki (04:54 veya 07:54) gerçek 1H borsa mum fiyatını kullan!
        const wasDelayedBySleep =
          !f.settledAtMs || f.settledAtMs - f.targetAtMs > 35 * 60 * 1000;
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

        if (f.expectedDirection === 'YATAY') {
          f.directionHit = f.inside90Band;
          f.status = 'YATAY_NÖTR';
        } else {
          const actualUp = trueTargetPx >= f.baselinePrice;
          const predUp = f.expectedDirection === 'YÜKSELİŞ';
          f.directionHit = actualUp === predUp;
          f.status = f.directionHit ? 'DOĞRU' : 'YANLIŞ';
        }

        // Giriş anındaki 5 uzman vektörünü ve mum anatomisini yeniden oluştur (eksikse)
        if (!f.expertsAtEntry && h1.length >= 30 && daily.length >= 60) {
          const h1Idx = findBarIndexAtTime(h1, f.lockedAtMs);
          const micro = analyzeCandlestickAndMicrostructure(h1, f.digits, h1Idx);
          const dPack = buildDailyIndicatorPack(daily);
          const p12 = build12hIndicatorPack(h1.slice(0, h1Idx + 1));
          const dpIdx = findBarIndexAtTime(dPack.bars, f.lockedAtMs);
          const snapAtLock = evaluateZacAt(
            f.symbol,
            f.digits,
            f.baselinePrice,
            dPack,
            dpIdx,
            p12,
            Math.max(0, p12.bars.length - 1),
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
            ZAC_MR12_ASSETS.has(f.symbol)
          );
          f.patternAtEntry = micro.pattern;
          f.patternLabelAtEntryTR = micro.patternLabelTR;
          f.vsaDetailTR = micro.vsaDetailTR;
          f.structureLabelTR = micro.structureLabelTR;
          f.er1hAtEntry = micro.er1h;
          f.volRatioAtEntry = snapAtLock.volRatio;
        }

        const fallbackExperts: ExpertSignalVector = f.expertsAtEntry || {
          E1_MACRO_TREND: f.zacScore,
          E2_MICRO_DISPLACEMENT: Math.round(f.zacScore * 0.5),
          E3_MEAN_REV_SPRING: Math.round(-f.zacScore * 0.4),
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
          patternLabelAtEntryTR: f.patternLabelAtEntryTR || 'Standart Mum Akışı',
          er1hAtEntry: f.er1hAtEntry ?? 0.22,
          volRatioAtEntry: f.volRatioAtEntry ?? 1.05,
          settledAtMs: f.settledAtMs || f.targetAtMs,
        });
      }
      store.cortexCalibrated = true;
    }

    // 2) BEKLEYEN tüm kilitli tahminleri canlı fiyatla güncelle; vadesi dolanları SONUÇLANDIR & ÖĞREN!
    for (const f of store.forecasts) {
      if (f.status !== 'BEKLİYOR') continue;
      const livePx = livePriceMap.get(f.symbol);
      if (!livePx || !(livePx > 0)) continue;

      const h1 = h1Map.get(f.symbol) || [];
      const roundedLive = roundTo(livePx, f.digits);
      f.currentLivePrice = roundedLive;
      f.currentMovePct =
        f.baselinePrice > 0 ? +(((roundedLive - f.baselinePrice) / f.baselinePrice) * 100).toFixed(3) : 0;

      if (nowMs >= f.targetAtMs) {
        // Eğer vade üzerinden >25 dk geçtiyse hedef saatin gerçek 1H mum kapanışını al
        const settlePx =
          nowMs - f.targetAtMs > 25 * 60 * 1000 && h1.length > 0
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
        f.settledAtMs = nowMs;
        f.settledAtTR = formatTR(nowMs);

        if (f.expectedDirection === 'YATAY') {
          f.directionHit = f.inside90Band;
          f.status = 'YATAY_NÖTR';
        } else {
          const actualUp = settlePx >= f.baselinePrice;
          const predUp = f.expectedDirection === 'YÜKSELİŞ';
          f.directionHit = actualUp === predUp;
          f.status = f.directionHit ? 'DOĞRU' : 'YANLIŞ';
        }

        // Cortex v15.0 Öz-Öğrenme & Kök-Neden Post-Mortem Çalıştır!
        const fallbackExperts: ExpertSignalVector = f.expertsAtEntry || {
          E1_MACRO_TREND: f.zacScore,
          E2_MICRO_DISPLACEMENT: Math.round(f.zacScore * 0.5),
          E3_MEAN_REV_SPRING: Math.round(-f.zacScore * 0.4),
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
          patternLabelAtEntryTR: f.patternLabelAtEntryTR || 'Standart Mum Akışı',
          er1hAtEntry: f.er1hAtEntry ?? 0.22,
          volRatioAtEntry: f.volRatioAtEntry ?? 1.05,
          settledAtMs: nowMs,
        });
      }
    }

    // 3) Açık piyasalarda CORTEX v15.0 5-Uzmanlı Adaptif Ağırlıklarla yeni ileri-dönük tahminler kilitle!
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
      const p12 = build12hIndicatorPack(h1);

      const completedDailyIdx =
        dPack.bars.length >= 2 && dPack.bars[dPack.bars.length - 1].timestamp + 24 * 3600000 > nowMs
          ? dPack.bars.length - 2
          : dPack.bars.length - 1;
      const completed12Idx =
        p12.bars.length >= 2 && p12.bars[p12.bars.length - 1].timestamp + 12 * 3600000 > nowMs
          ? p12.bars.length - 2
          : p12.bars.length - 1;

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

      // Kurumsal 1H Mum Anatomisi, VSA, Likidite Süpürmesi & FVG Analizi
      const micro = analyzeCandlestickAndMicrostructure(h1, spec.digits);
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
        ZAC_MR12_ASSETS.has(sym)
      );

      for (const { h, cooldownMs } of horizonsToLock) {
        const lastSame = store.forecasts.find((x) => x.symbol === sym && x.horizonHours === h);
        const needLock =
          !lastSame ||
          nowMs - lastSame.lockedAtMs >= cooldownMs ||
          (forceLockOpenMarkets && nowMs - lastSame.lockedAtMs >= 15 * 60 * 1000 && lastSame.status !== 'BEKLİYOR');

        if (!needLock) continue;

        const adaptive = computeAdaptiveHorizonForecast(
          h,
          livePx,
          snap.atr12h14,
          spec.digits,
          experts,
          micro,
          snap.activeSetup.pod !== 'NONE'
        );

        const targetAtMs = nowMs + h * 3600 * 1000;
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

    if (store.forecasts.length > 600) {
      store.forecasts = store.forecasts.slice(0, 600);
    }

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
  if (
    syncNow ||
    !cur.cortexCalibrated ||
    cur.forecasts.length === 0 ||
    Date.now() - cur.lastUpdatedAtMs > 60 * 1000
  ) {
    await Promise.all([
      syncNow ? runAutonomousBotTick(true).catch(() => {}) : Promise.resolve(),
      runLiveAuditTick(syncNow).catch(() => {}),
    ]);
  }

  const store = loadOrInitLiveAuditStore();
  const ledger = getAutonomousLedgerSnapshot();
  const aiBrain = loadOrInitAiBrain();

  const all = store.forecasts;
  const pending = all.filter((f) => f.status === 'BEKLİYOR');
  const settledDirectional = all.filter((f) => f.status === 'DOĞRU' || f.status === 'YANLIŞ');
  const settledAll = all.filter((f) => f.status !== 'BEKLİYOR');
  const dirHits = settledDirectional.filter((f) => f.status === 'DOĞRU').length;
  const hcSettled = settledDirectional.filter((f) => Math.abs(f.zacScore) >= 35 || f.activePod !== 'NONE');
  const hcHits = hcSettled.filter((f) => f.status === 'DOĞRU').length;
  const bandHits = settledAll.filter((f) => f.inside90Band).length;
  const avgErr =
    settledAll.length > 0
      ? +(settledAll.reduce((s, f) => s + (f.priceErrorPct || 0), 0) / settledAll.length).toFixed(3)
      : 0;

  const byHorizon: LiveAuditHorizonStats[] = ([1, 4, 24] as const).map((h) => {
    const sub = all.filter((f) => f.horizonHours === h);
    const subPending = sub.filter((f) => f.status === 'BEKLİYOR');
    const subSettledAll = sub.filter((f) => f.status !== 'BEKLİYOR');
    const subDir = sub.filter((f) => f.status === 'DOĞRU' || f.status === 'YANLIŞ');
    const subDirHits = subDir.filter((f) => f.status === 'DOĞRU').length;
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
      directionHitRatePct: subDir.length > 0 ? +((subDirHits / subDir.length) * 100).toFixed(1) : 0,
      band90Hits: subBandHits,
      band90CoveragePct: subSettledAll.length > 0 ? +((subBandHits / subSettledAll.length) * 100).toFixed(1) : 0,
      avgPriceErrorPct: subErr,
    };
  });

  const realizedPnL = ledger.closedTrades.reduce((s, t) => s + (t.realizedPnL_TRY || 0), 0);
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
      'Bu sayfada HİÇBİR geçmiş simülasyon (backtest) yoktur. Tüm tahminler hedef saat gelmeden önce 5-Uzmanlı Cortex v15.0 Yapay Zekası tarafından mühürlenir; vade dolduğunda gerçek fiyatla karşılaştırılıp kök-neden öz-eleştirisiyle ağırlıklar otomatik güncellenir.',
    portfolio: {
      isRunning: ledger.isRunning,
      liveUsdTry: ledger.liveUsdTry,
      vixLevel: ledger.vixLevel ?? 18,
      tickCount: ledger.tickCount ?? 0,
      lastTickAt: ledger.lastTickAt,
      initialCapitalTRY: ledger.initialCapitalTRY,
      totalEquityTRY: ledger.totalEquityTRY,
      cashBalanceTRY: ledger.cashBalanceTRY,
      availableCashTRY: ledger.availableCashTRY,
      allocatedMarginTRY: ledger.allocatedMarginTRY,
      realizedPnL_TRY: +realizedPnL.toFixed(2),
      floatingPnL_TRY: ledger.openFloatingPnL_TRY,
      netProfitTRY: ledger.netProfitTRY,
      netProfitPercent: ledger.netProfitPercent,
      totalFeesAndSwapTRY: +(
        (ledger.metrics.totalSpreadAndCommissionTRY || 0) + (ledger.metrics.totalFinancingTRY || 0)
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
        settledDirectional.length > 0 ? +((dirHits / settledDirectional.length) * 100).toFixed(1) : 0,
      highConvictionSettled: hcSettled.length,
      highConvictionHitRatePct:
        hcSettled.length > 0 ? +((hcHits / hcSettled.length) * 100).toFixed(1) : 0,
      band90CoveragePct: settledAll.length > 0 ? +((bandHits / settledAll.length) * 100).toFixed(1) : 0,
      avgPriceErrorPct: avgErr,
      byHorizon,
    },
    aiBrain,
    forecasts: all.slice(0, 150),
  };
}
