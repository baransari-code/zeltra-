import fs from 'fs';
import path from 'path';
import { fetchReal1YearData, fetchRealHourlyHistory, fetchRealFinancialNews, extractNewsSentimentForAsset, generate24HourPredictions } from './marketService';

export interface ForecastCheckpoint {
  hour: number;
  targetTimestamp: number;
  targetTimeStr: string;
  predictedPrice: number;
  upperBound: number;
  lowerBound: number;
  expectedDirection: 'YÜKSELİŞ' | 'DÜŞÜŞ' | 'YATAY';
  realizedPrice?: number;
  realizedTimestamp?: number;
  isInsideCorridor?: boolean;
  directionHit?: boolean;
  errorPercent?: number;
  evaluated: boolean;
}

export interface SymbolTestSeries {
  symbol: string;
  digits: number;
  baselinePrice: number;
  baselineTime: string;
  snapshots: {
    snapshotId: string;
    createdAt: string;
    initialPrice: number;
    checkpoints: ForecastCheckpoint[];
  }[];
  metrics: {
    totalEvaluated: number;
    inCorridorCount: number;
    corridorAccuracyPercent: number;
    directionHitCount: number;
    directionAccuracyPercent: number;
    meanAbsoluteErrorPercent: number;
  };
}

export interface ValidationTestState {
  testId: string;
  status: 'ACTIVE' | 'COMPLETED';
  startDate: string;
  targetEndDate: string;
  durationHours: number;
  lastTickTime: string;
  testSymbols: string[];
  series: Record<string, SymbolTestSeries>;
  overallMetrics: {
    totalCheckpointsEvaluated: number;
    overallCorridorAccuracy: number;
    overallDirectionalAccuracy: number;
    averageErrorPercent: number;
  };
}

const LEDGER_PATH = path.resolve(process.cwd(), 'data', 'forecast_4day_test.json');
const TEST_SYMBOLS = ['EUR/USD', 'XAU/USD', 'USD/JPY', 'BTC/USD', 'NAS100'];

export function loadTestState(): ValidationTestState {
  if (fs.existsSync(LEDGER_PATH)) {
    try {
      const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Fallback if corrupted
    }
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 4 * 24 * 3600 * 1000);

  const initialSeries: Record<string, SymbolTestSeries> = {};
  for (const sym of TEST_SYMBOLS) {
    const digits = sym.includes('JPY') || sym.includes('XAU') ? 2 : sym.includes('BTC') || sym.includes('NAS') ? 2 : 4;
    initialSeries[sym] = {
      symbol: sym,
      digits,
      baselinePrice: 0,
      baselineTime: now.toISOString(),
      snapshots: [],
      metrics: {
        totalEvaluated: 0,
        inCorridorCount: 0,
        corridorAccuracyPercent: 100,
        directionHitCount: 0,
        directionAccuracyPercent: 100,
        meanAbsoluteErrorPercent: 0,
      },
    };
  }

  const state: ValidationTestState = {
    testId: `ZELTRA-4DAY-VERIFY-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
    status: 'ACTIVE',
    startDate: now.toISOString(),
    targetEndDate: endDate.toISOString(),
    durationHours: 96,
    lastTickTime: now.toISOString(),
    testSymbols: TEST_SYMBOLS,
    series: initialSeries,
    overallMetrics: {
      totalCheckpointsEvaluated: 0,
      overallCorridorAccuracy: 100,
      overallDirectionalAccuracy: 100,
      averageErrorPercent: 0,
    },
  };

  saveTestState(state);
  return state;
}

export function saveTestState(state: ValidationTestState): void {
  try {
    const dir = path.dirname(LEDGER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Doğrulama dosyası yazılamadı:', err);
  }
}

// 4 Günlük Test Döngüsü: Yeni 24 Saatlik Tahmin Snapshot'ı Kaydet ve Süresi Dolan Noktaları Doğrula
export async function executeValidationCycle(): Promise<ValidationTestState> {
  const state = loadTestState();
  const now = Date.now();
  const nowDate = new Date(now).toISOString();
  state.lastTickTime = nowDate;

  // 1. Her bir sembol için gerçek fiyatları al ve süresi gelen noktaları değerlendir
  let newsList: any[] = [];
  try {
    newsList = await fetchRealFinancialNews();
  } catch {
    newsList = [];
  }

  for (const sym of state.testSymbols) {
    let marketData;
    let hourlyHistory: { timestamp: number; close: number }[] = [];
    try {
      [marketData, hourlyHistory] = await Promise.all([
        fetchReal1YearData(sym),
        fetchRealHourlyHistory(sym),
      ]);
    } catch {
      continue;
    }

    if (!marketData || !marketData.price) continue;

    const currentPrice = marketData.price;
    const series = state.series[sym];
    if (!series) continue;

    if (series.baselinePrice === 0) {
      series.baselinePrice = currentPrice;
      series.baselineTime = nowDate;
    }

    // A) Mevcut tüm snapshot'lardaki henüz değerlendirilmemiş ve zamanı geçmiş noktaları test et (PC kapalı olsa bile geçmiş saatlik mumlardan yakalar)
    for (const snap of series.snapshots) {
      for (const cp of snap.checkpoints) {
        if (!cp.evaluated && now >= cp.targetTimestamp) {
          // PC kapalıyken geçen saatler için Yahoo Finance 5 günlük saatlik mumlardan en yakın anı bul
          let matchedPrice = currentPrice;
          if (hourlyHistory && hourlyHistory.length > 0) {
            const closest = hourlyHistory.reduce((prev, curr) =>
              Math.abs(curr.timestamp - cp.targetTimestamp) < Math.abs(prev.timestamp - cp.targetTimestamp) ? curr : prev
            );
            if (closest && Math.abs(closest.timestamp - cp.targetTimestamp) <= 3 * 3600 * 1000) {
              matchedPrice = closest.close;
            }
          }

          const realizedPrice = +matchedPrice.toFixed(series.digits);
          cp.realizedPrice = realizedPrice;
          cp.realizedTimestamp = cp.targetTimestamp;
          cp.isInsideCorridor = realizedPrice >= cp.lowerBound && realizedPrice <= cp.upperBound;

          const priceDiff = realizedPrice - snap.initialPrice;
          const actualDir = priceDiff > 0 ? 'YÜKSELİŞ' : priceDiff < 0 ? 'DÜŞÜŞ' : 'YATAY';
          cp.directionHit = cp.expectedDirection === actualDir || actualDir === 'YATAY';

          cp.errorPercent = +((Math.abs(realizedPrice - cp.predictedPrice) / realizedPrice) * 100).toFixed(3);
          cp.evaluated = true;
        }
      }
    }

    // B) Eğer son snapshot üzerinden 6 saat geçmişse veya hiç snapshot yoksa yeni 24 saatlik rota kaydet
    const lastSnapshot = series.snapshots[series.snapshots.length - 1];
    const timeSinceLastSnap = lastSnapshot
      ? now - new Date(lastSnapshot.createdAt).getTime()
      : Infinity;

    if (!lastSnapshot || timeSinceLastSnap >= 6 * 3600 * 1000) {
      const newsContext = extractNewsSentimentForAsset(sym, newsList);
      const preds = generate24HourPredictions(currentPrice, marketData.candles, series.digits, 24, newsContext);

      const checkpoints: ForecastCheckpoint[] = preds.map((p) => ({
        hour: p.hour,
        targetTimestamp: p.targetTimestamp,
        targetTimeStr: p.targetTime,
        predictedPrice: p.predictedPrice,
        upperBound: p.upperBound,
        lowerBound: p.lowerBound,
        expectedDirection: p.expectedDirection,
        evaluated: false,
      }));

      series.snapshots.push({
        snapshotId: `SNAP-${sym.replace(/[\/\.\s]/g, '')}-${now}`,
        createdAt: nowDate,
        initialPrice: currentPrice,
        checkpoints,
      });
    }

    // C) Sembol bazlı metrikleri güncelle
    let totalEval = 0;
    let inCorr = 0;
    let dirHits = 0;
    let errorSum = 0;

    for (const snap of series.snapshots) {
      for (const cp of snap.checkpoints) {
        if (cp.evaluated) {
          totalEval++;
          if (cp.isInsideCorridor) inCorr++;
          if (cp.directionHit) dirHits++;
          if (cp.errorPercent !== undefined) errorSum += cp.errorPercent;
        }
      }
    }

    series.metrics.totalEvaluated = totalEval;
    series.metrics.inCorridorCount = inCorr;
    series.metrics.corridorAccuracyPercent = totalEval > 0 ? +((inCorr / totalEval) * 100).toFixed(2) : 100;
    series.metrics.directionHitCount = dirHits;
    series.metrics.directionAccuracyPercent = totalEval > 0 ? +((dirHits / totalEval) * 100).toFixed(2) : 100;
    series.metrics.meanAbsoluteErrorPercent = totalEval > 0 ? +(errorSum / totalEval).toFixed(3) : 0;
  }

  // 2. Genel toplu metrikleri hesapla
  let totalAll = 0;
  let inCorrAll = 0;
  let dirAll = 0;
  let errAll = 0;

  for (const sym of state.testSymbols) {
    const m = state.series[sym]?.metrics;
    if (m && m.totalEvaluated > 0) {
      totalAll += m.totalEvaluated;
      inCorrAll += m.inCorridorCount;
      dirAll += m.directionHitCount;
      errAll += m.meanAbsoluteErrorPercent * m.totalEvaluated;
    }
  }

  state.overallMetrics.totalCheckpointsEvaluated = totalAll;
  state.overallMetrics.overallCorridorAccuracy = totalAll > 0 ? +((inCorrAll / totalAll) * 100).toFixed(2) : 100;
  state.overallMetrics.overallDirectionalAccuracy = totalAll > 0 ? +((dirAll / totalAll) * 100).toFixed(2) : 100;
  state.overallMetrics.averageErrorPercent = totalAll > 0 ? +(errAll / totalAll).toFixed(3) : 0;

  // 4 gün doldu mu kontrolü
  if (now >= new Date(state.targetEndDate).getTime()) {
    state.status = 'COMPLETED';
  }

  saveTestState(state);
  return state;
}
