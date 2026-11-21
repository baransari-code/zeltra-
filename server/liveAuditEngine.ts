// server/liveAuditEngine.ts
// ZELTRA /canli — %100 GERÇEK ZAMANLI, İLERİ-DÖNÜK (FORWARD-ONLY) KİLİTLİ TAHMİN & GERÇEKLEŞEN KÂR DEFTERİ
// Sıfır backtest, sıfır geçmiş simülasyon, sıfır sonradan düzenleme:
//   1. Her tahmin, hedef saat henüz GELMEDEN gerçek canlı fiyatla kilitlenir ve diske yazılır.
//   2. Hedef saat geldiğinde, o anki gerçek piyasa fiyatıyla otomatik olarak karşılaştırılıp DOĞRU / YANLIŞ işlenir.
//   3. Canlı 250.000 TL otonom test kasasının sadece ileriye dönük gerçek zamanlı kâr/zararı birlikte gösterilir.

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
  type ZacPodType,
} from './zeltraAlphaIndicator';
import {
  CORE_SYMBOLS,
  getAutonomousLedgerSnapshot,
  getSpec,
  isMarketOpenForAsset,
  LIVE_GO_TARGET_ISO,
  runAutonomousBotTick,
  STRATEGY_VERSION,
} from './autonomousTrader';

const AUDIT_FILE = path.resolve(process.cwd(), 'data', 'live_forward_audit.json');
const AUDIT_SCHEMA_VERSION = 'live-forward-v1';

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
  // Kilit anında değişmez olarak mühürlenen değerler:
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
  // Canlı takip & hedef saatte otomatik sonuçlandırma alanları:
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
}

export interface LiveForwardAuditStore {
  schemaVersion: string;
  strategyVersion: string;
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
      const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
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

// =========================================================================
// GERÇEK ZAMANLI TAHMİN KİLİTLEME & HEDEF SAATTE OTOMATİK SONUÇLANDIRMA
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

    // 1) Tüm 17 varlık için güncel canlı fiyatı çek (sadece açık piyasa + bekleyen tahmini olanlar)
    const pendingSymbols = new Set(
      store.forecasts.filter((f) => f.status === 'BEKLİYOR').map((f) => f.symbol)
    );
    const activeSymbols = CORE_SYMBOLS.filter(
      (s) => isMarketOpenForAsset(s, nowMs).open || pendingSymbols.has(s)
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

    // 2) Önce BEKLEYEN tüm kilitli tahminleri canlı fiyatla güncelle ve vadesi gelenleri SONUÇLANDIR
    for (const f of store.forecasts) {
      if (f.status !== 'BEKLİYOR') continue;
      const livePx = livePriceMap.get(f.symbol);
      if (!livePx || !(livePx > 0)) continue;

      const roundedPx = roundTo(livePx, f.digits);
      f.currentLivePrice = roundedPx;
      f.currentMovePct =
        f.baselinePrice > 0 ? +(((roundedPx - f.baselinePrice) / f.baselinePrice) * 100).toFixed(3) : 0;

      // Vade dolduysa GERÇEKLEŞEN fiyatla mühürle (bir daha değişmez!)
      if (nowMs >= f.targetAtMs) {
        f.actualPrice = roundedPx;
        f.actualMovePct = f.currentMovePct;
        f.priceErrorPct =
          f.baselinePrice > 0
            ? +((Math.abs(roundedPx - f.predictedPrice) / f.baselinePrice) * 100).toFixed(3)
            : 0;
        f.inside90Band = roundedPx >= f.lower90 && roundedPx <= f.upper90;
        f.settledAtMs = nowMs;
        f.settledAtTR = formatTR(nowMs);

        if (f.expectedDirection === 'YATAY') {
          f.directionHit = f.inside90Band;
          f.status = 'YATAY_NÖTR';
        } else {
          const actualUp = roundedPx >= f.baselinePrice;
          const predUp = f.expectedDirection === 'YÜKSELİŞ';
          f.directionHit = actualUp === predUp;
          f.status = f.directionHit ? 'DOĞRU' : 'YANLIŞ';
        }
      }
    }

    // 3) Açık piyasalarda (+1S, +4S, +24S) yeni ileri-dönük tahminler kilitle!
    // Her (sembol, ufuk) için spam önleme: aynı ufukta henüz kapanmamış veya son aralıkta kilitlenmiş kayıt varsa bekle.
    const ledger = getAutonomousLedgerSnapshot();
    const radarMap = new Map((ledger.lastMarketRadar || []).map((r) => [r.symbol, r]));
    const horizonsToLock: { h: ForecastHorizonH; cooldownMs: number }[] = [
      { h: 1, cooldownMs: 55 * 60 * 1000 },       // Saat başı +1S canlı test tahmini
      { h: 4, cooldownMs: 3.8 * 3600 * 1000 },    // 4 saatte bir +4S tahmini
      { h: 24, cooldownMs: 11.5 * 3600 * 1000 },  // 12 saatte bir +24S tahmini
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

      for (const { h, cooldownMs } of horizonsToLock) {
        const lastSame = store.forecasts.find((x) => x.symbol === sym && x.horizonHours === h);
        const needLock =
          !lastSame ||
          nowMs - lastSame.lockedAtMs >= cooldownMs ||
          (forceLockOpenMarkets && nowMs - lastSame.lockedAtMs >= 15 * 60 * 1000 && lastSame.status !== 'BEKLİYOR');

        if (!needLock) continue;

        // +1H için saatlik ölçeklendirilmiş ZAC konisi, +4H ve +24H için doğrudan ZAC horizonu
        let expectedPrice: number;
        let lower90: number;
        let upper90: number;
        let expectedMovePct: number;
        let pUp: number;
        let expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';

        if (h === 1) {
          const sigma1h = Math.max(1e-9, snap.atr12h14 / Math.sqrt(12)) * 0.85;
          const driftFactor = snap.activeSetup.pod !== 'NONE' ? 0.36 : 0.24;
          const delta = (snap.zacScore / 100) * sigma1h * driftFactor;
          expectedPrice = roundTo(livePx + delta, spec.digits);
          expectedMovePct = livePx > 0 ? +((delta / livePx) * 100).toFixed(3) : 0;
          const bandHalf = 1.65 * sigma1h;
          lower90 = roundTo(Math.max(livePx * 0.5, expectedPrice - bandHalf), spec.digits);
          upper90 = roundTo(expectedPrice + bandHalf, spec.digits);
          const zEdge = Math.max(-1, Math.min(1, snap.zacScore / 100));
          pUp = Math.round(Math.max(30, Math.min(70, 50 + zEdge * (snap.activeSetup.pod !== 'NONE' ? 14 : 8))));
          expectedDirection = pUp >= 53 ? 'YÜKSELİŞ' : pUp <= 47 ? 'DÜŞÜŞ' : 'YATAY';
        } else {
          const hz = snap.horizons.find((x) => x.horizonHours === h)!;
          expectedPrice = hz.expectedPrice;
          expectedMovePct = hz.expectedMovePct;
          lower90 = hz.lower90;
          upper90 = hz.upper90;
          pUp = hz.pUp;
          expectedDirection = hz.direction;
        }

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
          predictedPrice: expectedPrice,
          predictedMovePct: expectedMovePct,
          expectedDirection,
          lower90,
          upper90,
          zacScore: snap.zacScore,
          pUp,
          activePod: snap.activeSetup.pod,
          regimeLabelTR: snap.regimeLabelTR,
          status: 'BEKLİYOR',
          currentLivePrice: roundTo(livePx, spec.digits),
          currentMovePct: 0,
        };
        store.forecasts.unshift(lockedRec);
      }
    }

    // Maksimum 600 tarihsel kayıt tut (en yeniler üstte)
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
  if (syncNow) {
    await Promise.all([
      runAutonomousBotTick(true).catch(() => {}),
      runLiveAuditTick(true).catch(() => {}),
    ]);
  } else {
    const cur = loadOrInitLiveAuditStore();
    if (cur.forecasts.length === 0 || Date.now() - cur.lastUpdatedAtMs > 60 * 1000) {
      await runLiveAuditTick(false).catch(() => {});
    }
  }

  const store = loadOrInitLiveAuditStore();
  const ledger = getAutonomousLedgerSnapshot();
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
      'Bu sayfada HİÇBİR geçmiş simülasyon (backtest) yoktur. Tüm tahminler hedef saat gelmeden önce gerçek canlı fiyatla mühürlenir ve zamanı geldiğinde gerçek borsa fiyatıyla otomatik doğrulanır.',
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
    forecasts: all.slice(0, 150),
  };
}
