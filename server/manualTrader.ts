// server/manualTrader.ts — ZELTRA /test2 Gerçek Piyasa Manuel İşlem Arenası (Sen vs Otonom Bot 250.000 TL Yarışması)
import fs from 'fs';
import path from 'path';
import type http from 'http';
import { fetchReal1YearData, fetchLiveUsdTryRate } from './marketService';
import {
  AutonomousLedgerState,
  AutonomousTrade,
  CORE_UNIVERSE,
  InstrumentMicroSpec,
  computeIbkrCommissionTRY,
  getSpec,
  isMarketOpenForAsset,
  loadOrInitAutonomousLedger,
  recalculateLedgerMetrics,
} from './autonomousTrader';

const MANUAL_LEDGER_FILE = path.resolve(process.cwd(), 'data', 'manual_trader_ledger.json');

export interface ArenaUniverseItem {
  symbol: string;
  name: string;
  digits: number;
  unitLabel: string;
  cluster: InstrumentMicroSpec['cluster'];
  maxIbkrLeverage: number;
  ibkrCommissionRate: number;
  ibkrMinFeeUSD: number;
  ibkrPerShareUSD?: number;
  spreadPts: number;
  slippagePts: number;
  price: number;
  bid: number;
  ask: number;
  change24hPercent: number;
  isOpen: boolean;
  closedReason?: string;
  botStatus?: string;
  botDirection?: string;
  botScore?: number;
  botReason?: string;
}

export interface ArenaComparisonSummary {
  userEquityTRY: number;
  botEquityTRY: number;
  leadTRY: number; // + ise Sen öndesin, - ise Bot önde
  leader: 'USER' | 'BOT' | 'TIE';
  userNetPct: number;
  botNetPct: number;
  userTradesTotal: number;
  botTradesTotal: number;
  userWinRate: number;
  botWinRate: number;
  userDirAccuracy: number;
  botDirAccuracy: number;
  userPF: number;
  botPF: number;
  userFeesTRY: number;
  botFeesTRY: number;
  userSpot1xTRY: number;
  botSpot1xTRY: number;
  botOpenCount: number;
  botRunning: boolean;
  botLastTickAt: string;
  botStrategyVersion: string;
  userCurve: { timestamp: number; timeStr: string; equityTRY: number }[];
  botCurve: { timestamp: number; timeStr: string; equityTRY: number }[];
}

export interface ManualArenaResponse {
  userLedger: AutonomousLedgerState;
  universe: ArenaUniverseItem[];
  arena: ArenaComparisonSummary;
}

function createCleanManualLedger(initialCapitalTRY = 250000, usdTry = 50.34): AutonomousLedgerState {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    botId: 'ZELTRA-USER-ARENA-250K',
    strategyVersion: 'manual-ibkr-v1',
    isRunning: true,
    startedAt: nowIso,
    lastTickAt: nowIso,
    liveUsdTry: usdTry,
    initialCapitalTRY,
    cashBalanceTRY: initialCapitalTRY,
    allocatedMarginTRY: 0,
    availableCashTRY: initialCapitalTRY,
    openFloatingPnL_TRY: 0,
    totalEquityTRY: initialCapitalTRY,
    netProfitTRY: 0,
    netProfitPercent: 0,
    metrics: {
      totalClosedTrades: 0,
      openPositionsCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      grossProfitTRY: 0,
      grossLossTRY: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      peakEquityTRY: initialCapitalTRY,
      avgWinTRY: 0,
      avgLossTRY: 0,
      payoffRatio: 0,
      expectancyTRY: 0,
      expectancyR: 0,
      realizedRMultipleTotal: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      totalSpreadAndCommissionTRY: 0,
      totalSignalsExecuted: 0,
      directionCorrectCount: 0,
      directionAccuracyPercent: 0,
      netProfitableCount: 0,
      netProfitablePercent: 0,
      totalPredictedGrossTRY: 0,
      totalCumulativeVolumeTRY: 0,
      activeNotionalVolumeTRY: 0,
      avgMarginLeverage: 0,
      portfolioEffectiveLeverage: 0,
      spot1xTotalNetProfitTRY: 0,
      currentStreak: { type: 'NONE', count: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
    },
    attribution: {
      byAsset: [],
      byDirection: {
        long: { direction: 'AL (LONG)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
        short: { direction: 'SAT (SHORT)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_TRY: 0, avgRMultiple: 0, profitFactor: 0 },
      },
    },
    marketScanner: [],
    openPositions: [],
    closedTrades: [],
    equityCurve: [
      {
        timestamp: now,
        timeStr: new Date(now).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        equityTRY: initialCapitalTRY,
        cashTRY: initialCapitalTRY,
        drawdownPercent: 0,
      },
    ],
    activityLog: [
      {
        id: `MAN-INIT-${now}`,
        timestamp: nowIso,
        type: 'SYSTEM',
        symbol: 'ARENA',
        message: '250.000,00 TL Manuel IBKR Arena hesabı başlatıldı. Gerçek piyasa fiyatları, spread ve IBKR komisyonlarıyla özgürce işlem açabilirsiniz.',
        equityAfterTRY: initialCapitalTRY,
      },
    ],
  };
}

function saveManualLedger(state: AutonomousLedgerState): void {
  try {
    const dir = path.dirname(MANUAL_LEDGER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${MANUAL_LEDGER_FILE}.tmp`;
    const serialized = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    try {
      fs.renameSync(tmpPath, MANUAL_LEDGER_FILE);
    } catch {
      fs.writeFileSync(MANUAL_LEDGER_FILE, serialized, 'utf-8');
    }
  } catch (err) {
    console.error('Manuel arena kütüğü kaydedilemedi:', err);
  }
}

async function loadOrInitManualLedger(): Promise<AutonomousLedgerState> {
  if (fs.existsSync(MANUAL_LEDGER_FILE)) {
    try {
      const raw = fs.readFileSync(MANUAL_LEDGER_FILE, 'utf-8');
      const parsed: AutonomousLedgerState = JSON.parse(raw);
      if (parsed && parsed.initialCapitalTRY) {
        recalculateLedgerMetrics(parsed);
        return parsed;
      }
    } catch {
      // Re-init on corruption
    }
  }
  const usdTry = await fetchLiveUsdTryRate();
  const clean = createCleanManualLedger(250000, usdTry);
  saveManualLedger(clean);
  return clean;
}

// Mutex Lock: eşzamanlı kullanıcı emri + 10sn arka plan tick yarışmasını önler
let manualQueue: Promise<any> = Promise.resolve();
function withManualLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = manualQueue.then(fn, fn);
  manualQueue = next.catch(() => {});
  return next;
}

function getLiveBidAsk(market: any, spec: InstrumentMicroSpec): { mid: number; bid: number; ask: number; actualSpread: number } {
  const mid = +(market?.price || 0).toFixed(spec.digits);
  const half = spec.spreadPts / 2;
  const bid = +(typeof market?.bid === 'number' && market.bid > 0 ? market.bid : mid - half).toFixed(spec.digits);
  const ask = +(typeof market?.ask === 'number' && market.ask > 0 ? market.ask : mid + half).toFixed(spec.digits);
  const actualSpread = +Math.max(0, ask - bid).toFixed(spec.digits);
  return { mid, bid, ask, actualSpread };
}

function applyOpenPositionsValuation(
  state: AutonomousLedgerState,
  marketMap: Map<string, any>,
  usdTry: number,
  now: number,
  nowIso: string
): void {
  const remaining: AutonomousTrade[] = [];

  for (const pos of state.openPositions) {
    const market = marketMap.get(pos.symbol);
    if (!market || !market.price) {
      remaining.push(pos);
      continue;
    }

    const spec = getSpec(pos.symbol);
    const isLong = pos.direction === 'AL (LONG)';
    const { bid: liveBid, ask: liveAsk } = getLiveBidAsk(market, spec);

    pos.bidAtTick = liveBid;
    pos.askAtTick = liveAsk;
    const livePrice = isLong ? liveBid : liveAsk;
    pos.currentPrice = livePrice;

    // Günlük IBKR Kaldıraçlı Gecelik Taşıma Maliyeti (UTC 00:00 devri)
    const todayUtc = nowIso.slice(0, 10);
    if (!pos.lastSwapDateUTC) pos.lastSwapDateUTC = (pos.entryTime || nowIso).slice(0, 10);
    if (todayUtc > pos.lastSwapDateUTC) {
      const remWeight = (pos.tp1Hit ? 0.5 : 1.0);
      const swapUnits = pos.positionSizeUnits * remWeight;
      const quoteToUsdSwap = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
      const curNotional = swapUnits * livePrice * quoteToUsdSwap * usdTry;
      const borrowed = Math.max(0, curNotional - pos.allocatedCapitalTRY * remWeight);
      if (borrowed > 0) {
        const swapFee = +(borrowed * (0.068 / 365)).toFixed(2);
        pos.financingCostTRY = +((pos.financingCostTRY || 0) + swapFee).toFixed(2);
        pos.executionCostTRY = +((pos.entryCommissionTRY || 0) + (pos.exitCommissionTRY || 0) + pos.financingCostTRY).toFixed(2);
        pos.realizedPnL_TRY = +(pos.realizedPnL_TRY - swapFee).toFixed(2);
        state.cashBalanceTRY = +(state.cashBalanceTRY - swapFee).toFixed(2);
      }
      pos.lastSwapDateUTC = todayUtc;
    }

    const quoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
    const slDist = Math.abs(pos.entryPrice - pos.initialStopLoss) || (pos.entryPrice * 0.02);
    const priceDiff = isLong ? livePrice - pos.entryPrice : pos.entryPrice - livePrice;
    const remUnits = pos.tp1Hit ? +(pos.positionSizeUnits * 0.5).toFixed(6) : pos.positionSizeUnits;

    const grossTRY = remUnits * priceDiff * quoteToUsd * usdTry;
    const closeNotional = remUnits * livePrice * quoteToUsd * usdTry;
    const estExitFeeTRY = computeIbkrCommissionTRY(spec, closeNotional, remUnits, usdTry);
    const netFloatingTRY = +(grossTRY - estExitFeeTRY).toFixed(2);
    const totalNetTRY = +(pos.realizedPnL_TRY + netFloatingTRY).toFixed(2);
    const rMult = +(priceDiff / slDist).toFixed(2);

    pos.grossUnrealizedPnL_TRY = +grossTRY.toFixed(2);
    pos.mfeR = Math.max(pos.mfeR ?? rMult, rMult);
    pos.maeR = Math.min(pos.maeR ?? rMult, rMult);
    pos.mfeTRY = Math.max(pos.mfeTRY ?? totalNetTRY, totalNetTRY);
    pos.maeTRY = Math.min(pos.maeTRY ?? totalNetTRY, totalNetTRY);

    const session = isMarketOpenForAsset(pos.symbol, new Date(now));

    // Marjin Tasfiyesi (%85 Teminat Erimesi — Gerçek IBKR Likidasyon Kalkanı)
    const isLiquidated = session.isOpen && netFloatingTRY <= -(pos.allocatedCapitalTRY * 0.85);
    // Stop Loss Kontrolü (Kullanıcının SL koyduğu pozisyonlarda canlı Bid/Ask tetiklenmesi)
    const hasActiveSl = pos.stopLoss > 0;
    const hitSl = session.isOpen && hasActiveSl && (isLong ? livePrice <= pos.stopLoss : livePrice >= pos.stopLoss);
    // Take Profit Kontrolü
    const hasActiveTp = pos.takeProfit2 > 0;
    const hitTp = session.isOpen && hasActiveTp && (isLong ? livePrice >= pos.takeProfit2 : livePrice <= pos.takeProfit2);

    if (isLiquidated || hitSl || hitTp) {
      const actualExitFee = estExitFeeTRY;
      const netDelta = +(grossTRY - actualExitFee).toFixed(2);
      pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + actualExitFee).toFixed(2);
      pos.executionCostTRY = +((pos.entryCommissionTRY || 0) + pos.exitCommissionTRY + (pos.financingCostTRY || 0)).toFixed(2);
      pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netDelta).toFixed(2);
      pos.grossUnrealizedPnL_TRY = 0;
      pos.unrealizedPnL_TRY = 0;
      pos.totalPnL_TRY = pos.realizedPnL_TRY;
      pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
      pos.closePrice = livePrice;
      pos.closeTime = nowIso;
      pos.closeTimestamp = now;

      if (hitTp) {
        pos.status = 'TP2_TAM_HEDEF';
        pos.exitReason = `Belirlediğiniz Take Profit (${pos.takeProfit2}) hedefine ulaşıldı @ ${livePrice}; IBKR komisyonu sonrası net kâr realize edildi.`;
      } else if (isLiquidated) {
        pos.status = 'STOP_LOSS';
        pos.exitReason = `Marjin Tasfiyesi (Likidasyon @ ${livePrice}): Pozisyon ayrılan teminatın %85'ini erittiği için IBKR risk kuralıyla zorunlu kapatıldı.`;
      } else {
        pos.status = 'STOP_LOSS';
        pos.exitReason = `Belirlediğiniz Stop Loss (${pos.stopLoss}) @ ${livePrice} seviyesinde tetiklendi (IBKR komisyon dahil).`;
      }

      state.cashBalanceTRY = +(state.cashBalanceTRY + netDelta).toFixed(2);
      state.closedTrades.unshift(pos);
      state.activityLog.unshift({
        id: `MAN-AUTOEXIT-${now}-${pos.id}`,
        timestamp: nowIso,
        type: hitTp ? 'TP2_FULL' : 'STOP_LOSS',
        symbol: pos.symbol,
        message: `${pos.symbol} (${pos.direction}) @ ${livePrice} otomatik kapandı (${hitTp ? 'Kâr Al' : isLiquidated ? 'Likidasyon' : 'Stop Loss'}): ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL net.`,
        pnlImpactTRY: netDelta,
      });
      continue;
    }

    pos.unrealizedPnL_TRY = netFloatingTRY;
    pos.totalPnL_TRY = totalNetTRY;
    pos.totalPnL_Percent = +((totalNetTRY / state.initialCapitalTRY) * 100).toFixed(2);
    pos.rMultiple = +(totalNetTRY / (pos.riskAmountTRY || 1)).toFixed(2);
    pos.spot1xEquivalentPnL_TRY = +(totalNetTRY / Math.max(1, pos.effectiveLeverage || 1)).toFixed(2);
    remaining.push(pos);
  }

  state.openPositions = remaining;
}

async function fetchUniverseSnapshot(): Promise<{ usdTry: number; marketMap: Map<string, any> }> {
  const [usdTry, entries] = await Promise.all([
    fetchLiveUsdTryRate(),
    Promise.all(
      CORE_UNIVERSE.map(async (c) => {
        try {
          const data = await fetchReal1YearData(c.symbol);
          return [c.symbol, data] as const;
        } catch {
          return [c.symbol, null] as const;
        }
      })
    ),
  ]);
  return { usdTry, marketMap: new Map(entries) };
}

function buildArenaResponse(
  userState: AutonomousLedgerState,
  botState: AutonomousLedgerState,
  marketMap: Map<string, any>,
  nowDate: Date
): ManualArenaResponse {
  const scannerMap = new Map((botState.marketScanner || []).map((s) => [s.symbol, s]));
  const universe: ArenaUniverseItem[] = CORE_UNIVERSE.map((spec) => {
    const market = marketMap.get(spec.symbol);
    const { mid, bid, ask } = getLiveBidAsk(market, spec);
    const session = isMarketOpenForAsset(spec.symbol, nowDate);
    const scan = scannerMap.get(spec.symbol);
    return {
      symbol: spec.symbol,
      name: spec.name,
      digits: spec.digits,
      unitLabel: spec.unitLabel,
      cluster: spec.cluster,
      maxIbkrLeverage: spec.maxIbkrLeverage,
      ibkrCommissionRate: spec.ibkrCommissionRate,
      ibkrMinFeeUSD: spec.ibkrMinFeeUSD,
      ibkrPerShareUSD: spec.ibkrPerShareUSD,
      spreadPts: spec.spreadPts,
      slippagePts: spec.slippagePts,
      price: mid || scan?.price || 0,
      bid: bid || scan?.price || 0,
      ask: ask || scan?.price || 0,
      change24hPercent: +(market?.changePercent24h || 0).toFixed(2),
      isOpen: session.isOpen,
      closedReason: session.reason,
      botStatus: scan?.status,
      botDirection: scan?.candidateDirection,
      botScore: scan?.confluenceScore,
      botReason: scan?.decisionReason,
    };
  });

  const leadTRY = +(userState.totalEquityTRY - botState.totalEquityTRY).toFixed(2);
  const arena: ArenaComparisonSummary = {
    userEquityTRY: userState.totalEquityTRY,
    botEquityTRY: botState.totalEquityTRY,
    leadTRY,
    leader: Math.abs(leadTRY) < 1 ? 'TIE' : leadTRY > 0 ? 'USER' : 'BOT',
    userNetPct: userState.netProfitPercent,
    botNetPct: botState.netProfitPercent,
    userTradesTotal: userState.closedTrades.length + userState.openPositions.length,
    botTradesTotal: botState.closedTrades.length + botState.openPositions.length,
    userWinRate: userState.metrics.winRatePercent,
    botWinRate: botState.metrics.winRatePercent,
    userDirAccuracy: userState.metrics.directionAccuracyPercent || 0,
    botDirAccuracy: botState.metrics.directionAccuracyPercent || 0,
    userPF: userState.metrics.profitFactor,
    botPF: botState.metrics.profitFactor,
    userFeesTRY: userState.metrics.totalSpreadAndCommissionTRY,
    botFeesTRY: botState.metrics.totalSpreadAndCommissionTRY,
    userSpot1xTRY: userState.metrics.spot1xTotalNetProfitTRY || 0,
    botSpot1xTRY: botState.metrics.spot1xTotalNetProfitTRY || 0,
    botOpenCount: botState.openPositions.length,
    botRunning: botState.isRunning,
    botLastTickAt: botState.lastTickAt,
    botStrategyVersion: botState.strategyVersion || 'v4.1-hedge-alpha',
    userCurve: (userState.equityCurve || []).map((c) => ({ timestamp: c.timestamp, timeStr: c.timeStr, equityTRY: c.equityTRY })),
    botCurve: (botState.equityCurve || []).map((c) => ({ timestamp: c.timestamp, timeStr: c.timeStr, equityTRY: c.equityTRY })),
  };

  return { userLedger: userState, universe, arena };
}

export async function executeManualTradingTick(includeFullUniverse = true): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [state, botState] = await Promise.all([loadOrInitManualLedger(), loadOrInitAutonomousLedger()]);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    state.lastTickAt = nowIso;

    let usdTry = state.liveUsdTry || 50.34;
    let marketMap = new Map<string, any>();

    if (includeFullUniverse) {
      const snap = await fetchUniverseSnapshot();
      usdTry = snap.usdTry;
      marketMap = snap.marketMap;
    } else if (state.openPositions.length > 0) {
      usdTry = await fetchLiveUsdTryRate();
      const openSyms = Array.from(new Set(state.openPositions.map((p) => p.symbol)));
      const entries = await Promise.all(
        openSyms.map(async (sym) => {
          try {
            return [sym, await fetchReal1YearData(sym)] as const;
          } catch {
            return [sym, null] as const;
          }
        })
      );
      marketMap = new Map(entries);
    }

    state.liveUsdTry = usdTry;
    if (state.openPositions.length > 0) {
      applyOpenPositionsValuation(state, marketMap, usdTry, now, nowIso);
    }

    recalculateLedgerMetrics(state);

    const lastPt = state.equityCurve[state.equityCurve.length - 1];
    if (!lastPt || now - lastPt.timestamp >= 60 * 1000 || Math.abs(lastPt.equityTRY - state.totalEquityTRY) >= 15) {
      state.equityCurve.push({
        timestamp: now,
        timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        equityTRY: state.totalEquityTRY,
        cashTRY: state.cashBalanceTRY,
      });
      if (state.equityCurve.length > 160) state.equityCurve = state.equityCurve.slice(-160);
      recalculateLedgerMetrics(state);
    }

    if (state.activityLog.length > 100) state.activityLog = state.activityLog.slice(0, 100);
    saveManualLedger(state);

    return buildArenaResponse(state, botState, marketMap, new Date(now));
  });
}

export interface ManualOpenOrderParams {
  symbol: string;
  direction: 'AL (LONG)' | 'SAT (SHORT)';
  marginTRY: number;
  leverage: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  note?: string;
}

export async function openManualPosition(params: ManualOpenOrderParams): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [state, botState, snap] = await Promise.all([
      loadOrInitManualLedger(),
      loadOrInitAutonomousLedger(),
      fetchUniverseSnapshot(),
    ]);

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const usdTry = snap.usdTry;
    state.liveUsdTry = usdTry;
    state.lastTickAt = nowIso;

    applyOpenPositionsValuation(state, snap.marketMap, usdTry, now, nowIso);
    recalculateLedgerMetrics(state);

    const spec = getSpec(params.symbol);
    const session = isMarketOpenForAsset(params.symbol, new Date(now));
    if (!session.isOpen) {
      throw new Error(session.reason || `${params.symbol} şu anda kapalı. Yalnızca açık piyasalarda emir verebilirsiniz.`);
    }

    const market = snap.marketMap.get(params.symbol);
    if (!market || !market.price) {
      throw new Error(`${params.symbol} için canlı borsa fiyatı şu an alınamadı.`);
    }

    const marginTRY = Number(params.marginTRY);
    if (!Number.isFinite(marginTRY) || marginTRY < 1000) {
      throw new Error('Minimum pozisyon teminatı 1.000,00 TL olmalıdır.');
    }
    if (marginTRY > state.availableCashTRY) {
      throw new Error(`Yetersiz serbest nakit! Kullanılabilir teminat: ${state.availableCashTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL.`);
    }

    const lev = Math.max(1, Math.min(spec.maxIbkrLeverage, Number(params.leverage) || 1));
    const { mid, bid: liveBid, ask: liveAsk, actualSpread } = getLiveBidAsk(market, spec);
    const isLong = params.direction === 'AL (LONG)';

    const entryPrice = isLong
      ? +(liveAsk + spec.slippagePts).toFixed(spec.digits)
      : +(liveBid - spec.slippagePts).toFixed(spec.digits);

    const rawNotionalTRY = marginTRY * lev;
    const quoteToUsd = params.symbol === 'USD/JPY' ? 1 / (entryPrice || 155) : 1;
    const unitDecimals = entryPrice >= 1000 ? 5 : entryPrice >= 1 ? 4 : 2;
    const units = +Math.max(0.00001, rawNotionalTRY / ((entryPrice * quoteToUsd * usdTry) || 1)).toFixed(unitDecimals);
    const actualNotionalTRY = +(units * entryPrice * quoteToUsd * usdTry).toFixed(2);
    const effectiveLeverage = +(actualNotionalTRY / marginTRY).toFixed(2);
    const accountLeverage = +(actualNotionalTRY / Math.max(1, state.totalEquityTRY)).toFixed(2);

    // Opsiyonel özel SL / TP doğrulaması
    let customSL = Number(params.stopLoss || 0);
    if (customSL > 0) {
      if (isLong && customSL >= entryPrice) {
        throw new Error(`Alış (Long) pozisyonunda Stop Loss giriş fiyatının (${entryPrice}) altında olmalıdır.`);
      }
      if (!isLong && customSL <= entryPrice) {
        throw new Error(`Satış (Short) pozisyonunda Stop Loss giriş fiyatının (${entryPrice}) üstünde olmalıdır.`);
      }
      customSL = +customSL.toFixed(spec.digits);
    } else {
      customSL = 0; // Kullanıcı açıkça SL koymadıysa yalnızca %85 marjin likidasyon koruması çalışır
    }

    let customTP = Number(params.takeProfit || 0);
    if (customTP > 0) {
      if (isLong && customTP <= entryPrice) {
        throw new Error(`Alış (Long) pozisyonunda Take Profit giriş fiyatının (${entryPrice}) üstünde olmalıdır.`);
      }
      if (!isLong && customTP >= entryPrice) {
        throw new Error(`Satış (Short) pozisyonunda Take Profit giriş fiyatının (${entryPrice}) altında olmalıdır.`);
      }
      customTP = +customTP.toFixed(spec.digits);
    } else {
      customTP = 0;
    }

    // Referans Risk / Tasfiye Mesafesi
    const autoLiqRatio = Math.min(0.85, 0.85 / effectiveLeverage);
    const refLiqStop = isLong
      ? +(entryPrice * (1 - autoLiqRatio)).toFixed(spec.digits)
      : +(entryPrice * (1 + autoLiqRatio)).toFixed(spec.digits);
    const refSlForStats = customSL > 0 ? customSL : refLiqStop;
    const slDist = Math.abs(entryPrice - refSlForStats) || entryPrice * 0.02;
    const riskAmountTRY = +(units * slDist * quoteToUsd * usdTry).toFixed(2);

    // IBKR Giriş Komisyonunu Peşin Kes
    const entryCommissionTRY = computeIbkrCommissionTRY(spec, actualNotionalTRY, units, usdTry);
    state.cashBalanceTRY = +(state.cashBalanceTRY - entryCommissionTRY).toFixed(2);

    const initLiqPrice = isLong ? liveBid : liveAsk;
    const initDiff = isLong ? initLiqPrice - entryPrice : entryPrice - initLiqPrice;
    const initCloseNotional = units * initLiqPrice * quoteToUsd * usdTry;
    const estExitFeeTRY = computeIbkrCommissionTRY(spec, initCloseNotional, units, usdTry);
    const initGrossTRY = +(units * initDiff * quoteToUsd * usdTry).toFixed(2);
    const initUnrealizedTRY = +(initGrossTRY - estExitFeeTRY).toFixed(2);
    const initRealizedTRY = +(-entryCommissionTRY).toFixed(2);
    const initTotalTRY = +(initRealizedTRY + initUnrealizedTRY).toFixed(2);

    const lotSize = +Math.max(0.001, units / spec.contractSize).toFixed(3);
    const trade: AutonomousTrade = {
      id: `USR-${params.symbol.replace(/[\/\.\s]/g, '')}-${now.toString().slice(-6)}`,
      symbol: params.symbol,
      name: spec.name,
      digits: spec.digits,
      direction: params.direction,
      status: 'ACIK',
      entryTime: nowIso,
      entryTimestamp: now,
      midEntryPrice: mid,
      entryPrice,
      currentPrice: initLiqPrice,
      bidAtTick: liveBid,
      askAtTick: liveAsk,
      takeProfit1: customTP > 0 ? customTP : 0,
      takeProfit2: customTP,
      stopLoss: customSL,
      initialStopLoss: refSlForStats,
      allocatedCapitalTRY: +marginTRY.toFixed(2),
      riskAmountTRY,
      positionSizeUnits: units,
      lotSize,
      contractSize: spec.contractSize,
      unitLabel: spec.unitLabel,
      notionalValueTRY: actualNotionalTRY,
      effectiveLeverage,
      accountLeverage,
      isLeveraged: effectiveLeverage > 1.05,
      spot1xEquivalentPnL_TRY: +(initTotalTRY / Math.max(1, effectiveLeverage)).toFixed(2),
      spreadPts: actualSpread,
      slippagePts: spec.slippagePts,
      executionCostTRY: entryCommissionTRY,
      entryCommissionTRY,
      exitCommissionTRY: 0,
      financingCostTRY: 0,
      lastSwapDateUTC: nowIso.slice(0, 10),
      usdTryAtEntry: usdTry,
      grossUnrealizedPnL_TRY: initGrossTRY,
      rMultiple: +(initTotalTRY / (riskAmountTRY || 1)).toFixed(2),
      mfeTRY: initTotalTRY,
      mfeR: +(initDiff / slDist).toFixed(2),
      maeTRY: initTotalTRY,
      maeR: +(initDiff / slDist).toFixed(2),
      tp1Hit: false,
      breakevenActive: false,
      trailingStopActive: false,
      realizedPnL_TRY: initRealizedTRY,
      unrealizedPnL_TRY: initUnrealizedTRY,
      totalPnL_TRY: initTotalTRY,
      totalPnL_Percent: +((initTotalTRY / state.initialCapitalTRY) * 100).toFixed(2),
      rationale: params.note?.trim() || `Manuel Kullanıcı Emri (${lev}x Kaldıraç, ${marginTRY.toLocaleString('tr-TR')} TL Teminat)`,
    };

    state.openPositions.unshift(trade);
    state.activityLog.unshift({
      id: `MAN-ENT-${now}-${trade.id}`,
      timestamp: nowIso,
      type: 'ENTRY',
      symbol: trade.symbol,
      direction: trade.direction,
      allocatedMarginTRY: trade.allocatedCapitalTRY,
      notionalVolumeTRY: trade.notionalValueTRY,
      effectiveLeverage: trade.effectiveLeverage,
      entryPrice: trade.entryPrice,
      executionCostTRY: entryCommissionTRY,
      pnlImpactTRY: initRealizedTRY,
      message: `MANUEL EMİR AÇILDI: ${trade.symbol} (${trade.direction} · ${units} ${spec.unitLabel} · ${effectiveLeverage}x) @ ${entryPrice} (IBKR Komisyon: -${entryCommissionTRY} TL)`,
    });

    recalculateLedgerMetrics(state);
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityTRY: state.totalEquityTRY,
      cashTRY: state.cashBalanceTRY,
    });
    saveManualLedger(state);

    return buildArenaResponse(state, botState, snap.marketMap, new Date(now));
  });
}

export async function closeManualPosition(tradeId: string, fraction = 1): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [state, botState, snap] = await Promise.all([
      loadOrInitManualLedger(),
      loadOrInitAutonomousLedger(),
      fetchUniverseSnapshot(),
    ]);

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const usdTry = snap.usdTry;
    state.liveUsdTry = usdTry;
    state.lastTickAt = nowIso;

    const idx = state.openPositions.findIndex((p) => p.id === tradeId);
    if (idx === -1) {
      throw new Error('Kapatılacak açık pozisyon bulunamadı.');
    }

    const pos = state.openPositions[idx];
    const spec = getSpec(pos.symbol);
    const session = isMarketOpenForAsset(pos.symbol, new Date(now));
    if (!session.isOpen) {
      throw new Error(session.reason || `${pos.symbol} piyasası şu an kapalı; piyasa açılışında kapatabilirsiniz.`);
    }

    const market = snap.marketMap.get(pos.symbol);
    if (!market || !market.price) {
      throw new Error(`${pos.symbol} canlı fiyatı alınamadı.`);
    }

    const isLong = pos.direction === 'AL (LONG)';
    const { bid: liveBid, ask: liveAsk } = getLiveBidAsk(market, spec);
    const closePrice = isLong ? liveBid : liveAsk;
    const remUnitsBefore = pos.tp1Hit ? +(pos.positionSizeUnits * 0.5).toFixed(6) : pos.positionSizeUnits;

    const isPartial = fraction < 0.99 && !pos.tp1Hit;
    const closeUnits = isPartial ? +(pos.positionSizeUnits * 0.5).toFixed(6) : remUnitsBefore;
    const quoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (closePrice || 155) : 1;
    const priceDiff = isLong ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
    const closeNotional = closeUnits * closePrice * quoteToUsd * usdTry;
    const exitFee = computeIbkrCommissionTRY(spec, closeNotional, closeUnits, usdTry);
    const grossDelta = closeUnits * priceDiff * quoteToUsd * usdTry;
    const netDelta = +(grossDelta - exitFee).toFixed(2);

    pos.exitCommissionTRY = +((pos.exitCommissionTRY || 0) + exitFee).toFixed(2);
    pos.executionCostTRY = +((pos.entryCommissionTRY || 0) + pos.exitCommissionTRY + (pos.financingCostTRY || 0)).toFixed(2);
    pos.realizedPnL_TRY = +(pos.realizedPnL_TRY + netDelta).toFixed(2);
    state.cashBalanceTRY = +(state.cashBalanceTRY + netDelta).toFixed(2);

    if (isPartial) {
      pos.tp1Hit = true;
      pos.currentPrice = closePrice;
      pos.bidAtTick = liveBid;
      pos.askAtTick = liveAsk;
      state.activityLog.unshift({
        id: `MAN-PART-${now}-${pos.id}`,
        timestamp: nowIso,
        type: 'TP1_PARTIAL',
        symbol: pos.symbol,
        pnlImpactTRY: netDelta,
        message: `MANUEL %50 KISMİ KAPANIŞ: ${pos.symbol} @ ${closePrice} (+%50 kapatıldı, etki: ${netDelta >= 0 ? '+' : ''}${netDelta.toLocaleString('tr-TR')} TL, IBKR çıkış kom: -${exitFee} TL).`,
      });
    } else {
      pos.grossUnrealizedPnL_TRY = 0;
      pos.unrealizedPnL_TRY = 0;
      pos.totalPnL_TRY = pos.realizedPnL_TRY;
      pos.totalPnL_Percent = +((pos.totalPnL_TRY / state.initialCapitalTRY) * 100).toFixed(2);
      pos.closePrice = closePrice;
      pos.closeTime = nowIso;
      pos.closeTimestamp = now;
      pos.status = 'MANUEL_KAPANDI';
      pos.exitReason = `Kullanıcı tarafından canlı piyasa kotasyonundan (@ ${closePrice}) manuel kapatıldı (Toplam IBKR komisyonu: -${pos.executionCostTRY} TL).`;

      state.openPositions.splice(idx, 1);
      state.closedTrades.unshift(pos);
      state.activityLog.unshift({
        id: `MAN-CLS-${now}-${pos.id}`,
        timestamp: nowIso,
        type: 'SYSTEM',
        symbol: pos.symbol,
        pnlImpactTRY: netDelta,
        message: `MANUEL KAPANIŞ: ${pos.symbol} (${pos.direction}) ${pos.entryPrice} → ${closePrice} | İşlem Neti: ${pos.totalPnL_TRY >= 0 ? '+' : ''}${pos.totalPnL_TRY.toLocaleString('tr-TR')} TL.`,
      });
    }

    if (state.openPositions.length > 0) {
      applyOpenPositionsValuation(state, snap.marketMap, usdTry, now, nowIso);
    }
    recalculateLedgerMetrics(state);
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityTRY: state.totalEquityTRY,
      cashTRY: state.cashBalanceTRY,
    });
    saveManualLedger(state);

    return buildArenaResponse(state, botState, snap.marketMap, new Date(now));
  });
}

export async function updateManualTpSl(params: { tradeId: string; stopLoss?: number | null; takeProfit?: number | null }): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [state, botState, snap] = await Promise.all([
      loadOrInitManualLedger(),
      loadOrInitAutonomousLedger(),
      fetchUniverseSnapshot(),
    ]);

    const pos = state.openPositions.find((p) => p.id === params.tradeId);
    if (!pos) throw new Error('Güncellenecek açık pozisyon bulunamadı.');

    const spec = getSpec(pos.symbol);
    const isLong = pos.direction === 'AL (LONG)';
    const curPx = pos.currentPrice || pos.entryPrice;

    if (params.stopLoss !== undefined) {
      const sl = Number(params.stopLoss || 0);
      if (sl > 0) {
        if (isLong && sl >= curPx) throw new Error(`Long Stop Loss anlık fiyatın (${curPx}) altında olmalıdır.`);
        if (!isLong && sl <= curPx) throw new Error(`Short Stop Loss anlık fiyatın (${curPx}) üstünde olmalıdır.`);
        pos.stopLoss = +sl.toFixed(spec.digits);
      } else {
        pos.stopLoss = 0;
      }
    }

    if (params.takeProfit !== undefined) {
      const tp = Number(params.takeProfit || 0);
      if (tp > 0) {
        if (isLong && tp <= curPx) throw new Error(`Long Take Profit anlık fiyatın (${curPx}) üstünde olmalıdır.`);
        if (!isLong && tp >= curPx) throw new Error(`Short Take Profit anlık fiyatın (${curPx}) altında olmalıdır.`);
        pos.takeProfit2 = +tp.toFixed(spec.digits);
        pos.takeProfit1 = pos.takeProfit2;
      } else {
        pos.takeProfit2 = 0;
        pos.takeProfit1 = 0;
      }
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    if (state.openPositions.length > 0) {
      applyOpenPositionsValuation(state, snap.marketMap, snap.usdTry, now, nowIso);
    }
    recalculateLedgerMetrics(state);
    saveManualLedger(state);

    return buildArenaResponse(state, botState, snap.marketMap, new Date(now));
  });
}

export async function resetManualArena(initialCapitalTRY = 250000): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [botState, snap] = await Promise.all([loadOrInitAutonomousLedger(), fetchUniverseSnapshot()]);
    const clean = createCleanManualLedger(initialCapitalTRY, snap.usdTry);
    saveManualLedger(clean);
    return buildArenaResponse(clean, botState, snap.marketMap, new Date());
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  if (req.method !== 'POST') return {};
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        reject(new Error('İstek boyutu sınırı aşıldı.'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Geçersiz JSON emir gövdesi.'));
      }
    });
    req.on('error', reject);
  });
}

// Hem prodServer.ts hem vite.config.ts tarafından ortak kullanılan /api/manual-test HTTP denetleyicisi
export async function handleManualTestHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const body = await readJsonBody(req);
    const action = String(body.action || urlObj.searchParams.get('action') || 'status');

    let payload: ManualArenaResponse;
    if (action === 'open') {
      payload = await openManualPosition({
        symbol: String(body.symbol || 'BTC/USD'),
        direction: body.direction === 'SAT (SHORT)' ? 'SAT (SHORT)' : 'AL (LONG)',
        marginTRY: Number(body.marginTRY),
        leverage: Number(body.leverage || 1),
        stopLoss: body.stopLoss !== undefined && body.stopLoss !== '' ? Number(body.stopLoss) : null,
        takeProfit: body.takeProfit !== undefined && body.takeProfit !== '' ? Number(body.takeProfit) : null,
        note: typeof body.note === 'string' ? body.note : undefined,
      });
    } else if (action === 'close') {
      const tradeId = String(body.tradeId || urlObj.searchParams.get('tradeId') || '');
      const fraction = body.fraction !== undefined ? Number(body.fraction) : 1;
      payload = await closeManualPosition(tradeId, fraction);
    } else if (action === 'update-tpsl') {
      payload = await updateManualTpSl({
        tradeId: String(body.tradeId || ''),
        stopLoss: body.stopLoss !== undefined && body.stopLoss !== '' ? Number(body.stopLoss) : null,
        takeProfit: body.takeProfit !== undefined && body.takeProfit !== '' ? Number(body.takeProfit) : null,
      });
    } else if (action === 'reset') {
      payload = await resetManualArena(250000);
    } else {
      payload = await executeManualTradingTick(true);
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (err: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err?.message || 'Manuel işlem motoru hatası' }));
  }
}
