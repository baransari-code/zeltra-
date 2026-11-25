// server/manualTrader.ts — ZELTRA /test2 Gerçek Piyasa Manuel İşlem Arenası (Sen vs Otonom Bot $25,000 USD IBKR Pro Yarışması)
import fs from 'fs';
import path from 'path';
import type http from 'http';
import { fetchReal1YearData, fetchLiveUsdTryRate } from './marketService';
import {
  AutonomousLedgerState,
  AutonomousTrade,
  CORE_UNIVERSE,
  INITIAL_CAPITAL_USD,
  InstrumentMicroSpec,
  computeIbkrCommissionUSD,
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
  ibkrMaxFeePct?: number;
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
  userEquityUSD: number;
  botEquityUSD: number;
  leadUSD: number; // + ise Sen öndesin, - ise Bot önde
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
  userFeesUSD: number;
  botFeesUSD: number;
  userSpot1xUSD: number;
  botSpot1xUSD: number;
  botOpenCount: number;
  botRunning: boolean;
  botLastTickAt: string;
  botStrategyVersion: string;
  userCurve: { timestamp: number; timeStr: string; equityUSD: number }[];
  botCurve: { timestamp: number; timeStr: string; equityUSD: number }[];
}

export interface ManualArenaResponse {
  userLedger: AutonomousLedgerState;
  universe: ArenaUniverseItem[];
  arena: ArenaComparisonSummary;
}

function createCleanManualLedger(initialCapitalUSD = INITIAL_CAPITAL_USD, usdTry = 50.59): AutonomousLedgerState {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return {
    botId: 'ZELTRA-USER-ARENA-USD',
    currency: 'USD',
    strategyVersion: 'manual-ibkr-v4-25k-usd',
    isRunning: true,
    startedAt: nowIso,
    lastTickAt: nowIso,
    liveUsdTry: usdTry,
    initialCapitalUSD,
    cashBalanceUSD: initialCapitalUSD,
    allocatedMarginUSD: 0,
    availableCashUSD: initialCapitalUSD,
    openFloatingPnL_USD: 0,
    totalEquityUSD: initialCapitalUSD,
    peakEquityUSD: initialCapitalUSD,
    netProfitUSD: 0,
    netProfitPercent: 0,
    metrics: {
      totalClosedTrades: 0,
      openPositionsCount: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePercent: 0,
      profitFactor: 0,
      maxDrawdownPercent: 0,
      avgWinUSD: 0,
      avgLossUSD: 0,
      expectancyUSD: 0,
      totalSpreadAndCommissionUSD: 0,
      totalFinancingUSD: 0,
      activeNotionalVolumeUSD: 0,
      avgMarginLeverage: 0,
      spot1xTotalNetProfitUSD: 0,
    },
    attribution: {
      byAsset: [],
      byDirection: {
        long: { direction: 'AL (LONG)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_USD: 0, avgRMultiple: 0, profitFactor: 0 },
        short: { direction: 'SAT (SHORT)', tradesCount: 0, wins: 0, losses: 0, winRatePercent: 0, netPnL_USD: 0, avgRMultiple: 0, profitFactor: 0 },
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
        equityUSD: initialCapitalUSD,
        cashUSD: initialCapitalUSD,
        drawdownPercent: 0,
      },
    ],
    activityLog: [
      {
        id: `MAN-INIT-${now}`,
        timestamp: nowIso,
        type: 'SYSTEM',
        symbol: 'ARENA',
        message: '$25,000.00 USD Manuel IBKR Pro Reg-T Margin Arena hesabı sıfırdan başlatıldı. Gerçek borsa Bid/Ask spread, kayma, SEC/FINRA TAF harçları ve IBKR komisyonlarıyla özgürce işlem açabilirsiniz.',
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
      const parsed: any = JSON.parse(raw);
      if (
        parsed &&
        parsed.currency === 'USD' &&
        parsed.strategyVersion === 'manual-ibkr-v4-25k-usd' &&
        Math.abs(Number(parsed.initialCapitalUSD || 0) - INITIAL_CAPITAL_USD) < 100
      ) {
        recalculateLedgerMetrics(parsed);
        return parsed as AutonomousLedgerState;
      }
    } catch {
      // Re-init on corruption
    }
  }
  const usdTry = await fetchLiveUsdTryRate().catch(() => 50.59);
  const clean = createCleanManualLedger(INITIAL_CAPITAL_USD, usdTry);
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

    // Günlük IBKR Kaldıraçlı Gecelik Taşıma Maliyeti (UTC 00:00 devri — doğrudan USD)
    const todayUtc = nowIso.slice(0, 10);
    if (!pos.lastSwapDateUTC) pos.lastSwapDateUTC = (pos.entryTime || nowIso).slice(0, 10);
    if (todayUtc > pos.lastSwapDateUTC) {
      const remWeight = pos.tp1Hit ? 0.5 : 1.0;
      const swapUnits = pos.positionSizeUnits * remWeight;
      const quoteToUsdSwap = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
      const curNotional = swapUnits * livePrice * quoteToUsdSwap;
      const borrowed = Math.max(0, curNotional - pos.allocatedCapitalUSD * remWeight);
      if (borrowed > 0) {
        const swapFee = +(borrowed * (0.0633 / 365)).toFixed(2);
        pos.financingCostUSD = +((pos.financingCostUSD || 0) + swapFee).toFixed(2);
        pos.executionCostUSD = +((pos.entryCommissionUSD || 0) + (pos.exitCommissionUSD || 0) + pos.financingCostUSD).toFixed(2);
        pos.realizedPnL_USD = +(pos.realizedPnL_USD - swapFee).toFixed(2);
        state.cashBalanceUSD = +(state.cashBalanceUSD - swapFee).toFixed(2);
      }
      pos.lastSwapDateUTC = todayUtc;
    }

    const quoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (livePrice || 155) : 1;
    const slDist = Math.abs(pos.entryPrice - pos.initialStopLoss) || pos.entryPrice * 0.02;
    const priceDiff = isLong ? livePrice - pos.entryPrice : pos.entryPrice - livePrice;
    const remUnits = pos.tp1Hit ? +(pos.positionSizeUnits * 0.5).toFixed(6) : pos.positionSizeUnits;

    const grossUSD = remUnits * priceDiff * quoteToUsd;
    const closeNotional = remUnits * livePrice * quoteToUsd;
    const estExitFeeUSD = computeIbkrCommissionUSD(spec, closeNotional, remUnits, isLong);
    const netFloatingUSD = +(grossUSD - estExitFeeUSD).toFixed(2);
    const totalNetUSD = +(pos.realizedPnL_USD + netFloatingUSD).toFixed(2);
    const rMult = +(priceDiff / slDist).toFixed(2);

    pos.grossUnrealizedPnL_USD = +grossUSD.toFixed(2);
    pos.mfeR = Math.max(pos.mfeR ?? rMult, rMult);
    pos.maeR = Math.min(pos.maeR ?? rMult, rMult);
    pos.mfeUSD = Math.max(pos.mfeUSD ?? totalNetUSD, totalNetUSD);
    pos.maeUSD = Math.min(pos.maeUSD ?? totalNetUSD, totalNetUSD);

    const session = isMarketOpenForAsset(pos.symbol, new Date(now));

    // Marjin Tasfiyesi (%85 Teminat Erimesi — Gerçek IBKR Likidasyon Kalkanı)
    const isLiquidated = session.isOpen && netFloatingUSD <= -(pos.allocatedCapitalUSD * 0.85);
    const hasActiveSl = pos.stopLoss > 0;
    const hitSl = session.isOpen && hasActiveSl && (isLong ? livePrice <= pos.stopLoss : livePrice >= pos.stopLoss);
    const hasActiveTp = pos.takeProfit2 > 0;
    const hitTp = session.isOpen && hasActiveTp && (isLong ? livePrice >= pos.takeProfit2 : livePrice <= pos.takeProfit2);

    if (isLiquidated || hitSl || hitTp) {
      const execClosePx = hitTp
        ? livePrice
        : +(isLong ? livePrice - spec.slippagePts : livePrice + spec.slippagePts).toFixed(spec.digits);
      const execDiff = isLong ? execClosePx - pos.entryPrice : pos.entryPrice - execClosePx;
      const execGrossUSD = remUnits * execDiff * quoteToUsd;
      const actualExitFee = computeIbkrCommissionUSD(spec, remUnits * execClosePx * quoteToUsd, remUnits, isLong);
      const netDelta = +(execGrossUSD - actualExitFee).toFixed(2);
      pos.exitCommissionUSD = +((pos.exitCommissionUSD || 0) + actualExitFee).toFixed(2);
      pos.executionCostUSD = +((pos.entryCommissionUSD || 0) + pos.exitCommissionUSD + (pos.financingCostUSD || 0)).toFixed(2);
      pos.realizedPnL_USD = +(pos.realizedPnL_USD + netDelta).toFixed(2);
      pos.grossUnrealizedPnL_USD = 0;
      pos.unrealizedPnL_USD = 0;
      pos.totalPnL_USD = pos.realizedPnL_USD;
      pos.totalPnL_Percent = +((pos.totalPnL_USD / state.initialCapitalUSD) * 100).toFixed(2);
      pos.closePrice = execClosePx;
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

      state.cashBalanceUSD = +(state.cashBalanceUSD + netDelta).toFixed(2);
      state.closedTrades.unshift(pos);
      state.activityLog.unshift({
        id: `MAN-AUTOEXIT-${now}-${pos.id}`,
        timestamp: nowIso,
        type: hitTp ? 'TP2_FULL' : 'STOP_LOSS',
        symbol: pos.symbol,
        message: `${pos.symbol} (${pos.direction}) @ ${livePrice} otomatik kapandı (${hitTp ? 'Kâr Al' : isLiquidated ? 'Likidasyon' : 'Stop Loss'}): ${pos.totalPnL_USD >= 0 ? '+' : '-'}$${Math.abs(pos.totalPnL_USD).toFixed(2)} net.`,
        pnlImpactUSD: netDelta,
      });
      continue;
    }

    pos.unrealizedPnL_USD = netFloatingUSD;
    pos.totalPnL_USD = totalNetUSD;
    pos.totalPnL_Percent = +((totalNetUSD / state.initialCapitalUSD) * 100).toFixed(2);
    pos.rMultiple = +(totalNetUSD / (pos.riskUSD || pos.riskAmountUSD || 1)).toFixed(2);
    pos.spot1xEquivalentPnL_USD = +(totalNetUSD / Math.max(1, pos.effectiveLeverage || 1)).toFixed(2);
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
  const radarMap = new Map((botState.lastMarketRadar || []).map((r) => [r.symbol, r]));
  const universe: ArenaUniverseItem[] = CORE_UNIVERSE.map((spec) => {
    const market = marketMap.get(spec.symbol);
    const { mid, bid, ask } = getLiveBidAsk(market, spec);
    const session = isMarketOpenForAsset(spec.symbol, nowDate);
    const scan = scannerMap.get(spec.symbol);
    const rad = radarMap.get(spec.symbol);
    const resolvedScore =
      typeof rad?.botScore === 'number'
        ? rad.botScore
        : typeof scan?.score === 'number'
          ? scan.score
          : typeof scan?.confluenceScore === 'number'
            ? scan.confluenceScore
            : 50;
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
      ibkrMaxFeePct: spec.ibkrMaxFeePct,
      spreadPts: spec.spreadPts,
      slippagePts: spec.slippagePts,
      price: mid || rad?.price || scan?.price || 0,
      bid: bid || rad?.bid || scan?.price || 0,
      ask: ask || rad?.ask || scan?.price || 0,
      change24hPercent: +(market?.changePercent24h ?? rad?.change24hPercent ?? 0).toFixed(2),
      isOpen: session.isOpen,
      closedReason: session.reason,
      botStatus: rad?.status || scan?.status || 'BEKLEMEDE',
      botDirection: rad?.direction || scan?.direction || scan?.candidateDirection || 'BEKLE',
      botScore: Math.min(100, Math.max(0, Math.round(resolvedScore))),
      botReason: rad?.reason || scan?.reason || scan?.decisionReason || '',
    };
  });

  const leadUSD = +(userState.totalEquityUSD - botState.totalEquityUSD).toFixed(2);
  const arena: ArenaComparisonSummary = {
    userEquityUSD: userState.totalEquityUSD,
    botEquityUSD: botState.totalEquityUSD,
    leadUSD,
    leader: Math.abs(leadUSD) < 0.25 ? 'TIE' : leadUSD > 0 ? 'USER' : 'BOT',
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
    userFeesUSD: userState.metrics.totalSpreadAndCommissionUSD,
    botFeesUSD: botState.metrics.totalSpreadAndCommissionUSD,
    userSpot1xUSD: userState.metrics.spot1xTotalNetProfitUSD || 0,
    botSpot1xUSD: botState.metrics.spot1xTotalNetProfitUSD || 0,
    botOpenCount: botState.openPositions.length,
    botRunning: botState.isRunning,
    botLastTickAt: botState.lastTickAt,
    botStrategyVersion: botState.strategyVersion || 'v15.2-zeltra-usd',
    userCurve: (userState.equityCurve || []).map((c) => ({ timestamp: c.timestamp, timeStr: c.timeStr, equityUSD: c.equityUSD })),
    botCurve: (botState.equityCurve || []).map((c) => ({ timestamp: c.timestamp, timeStr: c.timeStr, equityUSD: c.equityUSD })),
  };

  return { userLedger: userState, universe, arena };
}

export async function executeManualTradingTick(includeFullUniverse = true): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [state, botState] = await Promise.all([loadOrInitManualLedger(), loadOrInitAutonomousLedger()]);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    state.lastTickAt = nowIso;

    let usdTry = state.liveUsdTry || 50.59;
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
      applyOpenPositionsValuation(state, marketMap, now, nowIso);
    }

    recalculateLedgerMetrics(state);

    const lastPt = state.equityCurve[state.equityCurve.length - 1];
    if (!lastPt || now - lastPt.timestamp >= 60 * 1000 || Math.abs(lastPt.equityUSD - state.totalEquityUSD) >= 0.5) {
      state.equityCurve.push({
        timestamp: now,
        timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        equityUSD: state.totalEquityUSD,
        cashUSD: state.cashBalanceUSD,
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
  marginUSD: number;
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

    applyOpenPositionsValuation(state, snap.marketMap, now, nowIso);
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

    const marginUSD = Number(params.marginUSD);
    if (!Number.isFinite(marginUSD) || marginUSD < 10) {
      throw new Error('Minimum pozisyon teminatı $10.00 USD olmalıdır.');
    }
    if (marginUSD > state.availableCashUSD) {
      throw new Error(`Yetersiz serbest nakit! Kullanılabilir teminat: $${state.availableCashUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`);
    }

    const lev = Math.max(1, Math.min(spec.maxIbkrLeverage, Number(params.leverage) || 1));
    const { mid, bid: liveBid, ask: liveAsk, actualSpread } = getLiveBidAsk(market, spec);
    const isLong = params.direction === 'AL (LONG)';

    const entryPrice = isLong
      ? +(liveAsk + spec.slippagePts).toFixed(spec.digits)
      : +(liveBid - spec.slippagePts).toFixed(spec.digits);

    const rawNotionalUSD = marginUSD * lev;
    const quoteToUsd = params.symbol === 'USD/JPY' ? 1 / (entryPrice || 155) : 1;
    const unitDecimals = entryPrice >= 1000 ? 5 : entryPrice >= 1 ? 4 : 2;
    const units = +Math.max(0.00001, rawNotionalUSD / ((entryPrice * quoteToUsd) || 1)).toFixed(unitDecimals);
    const actualNotionalUSD = +(units * entryPrice * quoteToUsd).toFixed(2);
    const effectiveLeverage = +(actualNotionalUSD / marginUSD).toFixed(2);
    const accountLeverage = +(actualNotionalUSD / Math.max(1, state.totalEquityUSD)).toFixed(2);

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
      customSL = 0;
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
    const riskUSD = +(units * slDist * quoteToUsd).toFixed(2);

    // IBKR Giriş Komisyonunu Peşin Kes
    const entryCommissionUSD = +computeIbkrCommissionUSD(spec, actualNotionalUSD, units, !isLong).toFixed(2);
    state.cashBalanceUSD = +(state.cashBalanceUSD - entryCommissionUSD).toFixed(2);

    const initLiqPrice = isLong ? liveBid : liveAsk;
    const initDiff = isLong ? initLiqPrice - entryPrice : entryPrice - initLiqPrice;
    const initCloseNotional = units * initLiqPrice * quoteToUsd;
    const estExitFeeUSD = computeIbkrCommissionUSD(spec, initCloseNotional, units, isLong);
    const initGrossUSD = +(units * initDiff * quoteToUsd).toFixed(2);
    const initUnrealizedUSD = +(initGrossUSD - estExitFeeUSD).toFixed(2);
    const initRealizedUSD = +(-entryCommissionUSD).toFixed(2);
    const initTotalUSD = +(initRealizedUSD + initUnrealizedUSD).toFixed(2);

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
      allocatedCapitalUSD: +marginUSD.toFixed(2),
      riskUSD,
      positionSizeUnits: units,
      lotSize,
      contractSize: spec.contractSize,
      unitLabel: spec.unitLabel,
      notionalValueUSD: actualNotionalUSD,
      effectiveLeverage,
      accountLeverage,
      isLeveraged: effectiveLeverage > 1.05,
      spot1xEquivalentPnL_USD: +(initTotalUSD / Math.max(1, effectiveLeverage)).toFixed(2),
      spreadPts: actualSpread,
      slippagePts: spec.slippagePts,
      executionCostUSD: entryCommissionUSD,
      entryCommissionUSD,
      exitCommissionUSD: 0,
      financingCostUSD: 0,
      lastSwapDateUTC: nowIso.slice(0, 10),
      grossUnrealizedPnL_USD: initGrossUSD,
      rMultiple: +(initTotalUSD / (riskUSD || 1)).toFixed(2),
      mfeUSD: initTotalUSD,
      mfeR: +(initDiff / slDist).toFixed(2),
      maeUSD: initTotalUSD,
      maeR: +(initDiff / slDist).toFixed(2),
      tp1Hit: false,
      breakevenActive: false,
      trailingStopActive: false,
      realizedPnL_USD: initRealizedUSD,
      unrealizedPnL_USD: initUnrealizedUSD,
      totalPnL_USD: initTotalUSD,
      totalPnL_Percent: +((initTotalUSD / state.initialCapitalUSD) * 100).toFixed(2),
      rationale: params.note?.trim() || `Manuel Kullanıcı Emri (${lev}x Kaldıraç, $${marginUSD.toLocaleString('en-US')} Teminat)`,
    };

    state.openPositions.unshift(trade);
    state.activityLog.unshift({
      id: `MAN-ENT-${now}-${trade.id}`,
      timestamp: nowIso,
      type: 'ENTRY',
      symbol: trade.symbol,
      direction: trade.direction,
      allocatedMarginUSD: trade.allocatedCapitalUSD,
      notionalVolumeUSD: trade.notionalValueUSD,
      effectiveLeverage: trade.effectiveLeverage,
      entryPrice: trade.entryPrice,
      executionCostUSD: entryCommissionUSD,
      pnlImpactUSD: initRealizedUSD,
      message: `MANUEL EMİR AÇILDI: ${trade.symbol} (${trade.direction} · ${units} ${spec.unitLabel} · ${effectiveLeverage}x) @ ${entryPrice} (IBKR Komisyon: -$${entryCommissionUSD.toFixed(2)})`,
    });

    recalculateLedgerMetrics(state);
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityUSD: state.totalEquityUSD,
      cashUSD: state.cashBalanceUSD,
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
    state.liveUsdTry = snap.usdTry;
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
    const rawClosePrice = isLong ? liveBid : liveAsk;
    const closePrice = +(isLong ? rawClosePrice - spec.slippagePts : rawClosePrice + spec.slippagePts).toFixed(spec.digits);
    const remUnitsBefore = pos.tp1Hit ? +(pos.positionSizeUnits * 0.5).toFixed(6) : pos.positionSizeUnits;

    const isPartial = fraction < 0.99 && !pos.tp1Hit;
    const closeUnits = isPartial ? +(pos.positionSizeUnits * 0.5).toFixed(6) : remUnitsBefore;
    const quoteToUsd = pos.symbol === 'USD/JPY' ? 1 / (closePrice || 155) : 1;
    const priceDiff = isLong ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
    const closeNotional = closeUnits * closePrice * quoteToUsd;
    const exitFee = +computeIbkrCommissionUSD(spec, closeNotional, closeUnits, isLong).toFixed(2);
    const grossDelta = closeUnits * priceDiff * quoteToUsd;
    const netDelta = +(grossDelta - exitFee).toFixed(2);

    pos.exitCommissionUSD = +((pos.exitCommissionUSD || 0) + exitFee).toFixed(2);
    pos.executionCostUSD = +((pos.entryCommissionUSD || 0) + pos.exitCommissionUSD + (pos.financingCostUSD || 0)).toFixed(2);
    pos.realizedPnL_USD = +(pos.realizedPnL_USD + netDelta).toFixed(2);
    state.cashBalanceUSD = +(state.cashBalanceUSD + netDelta).toFixed(2);

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
        pnlImpactUSD: netDelta,
        message: `MANUEL %50 KISMİ KAPANIŞ: ${pos.symbol} @ ${closePrice} (+%50 kapatıldı, etki: ${netDelta >= 0 ? '+' : '-'}$${Math.abs(netDelta).toFixed(2)}, IBKR çıkış kom: -$${exitFee.toFixed(2)}).`,
      });
    } else {
      pos.grossUnrealizedPnL_USD = 0;
      pos.unrealizedPnL_USD = 0;
      pos.totalPnL_USD = pos.realizedPnL_USD;
      pos.totalPnL_Percent = +((pos.totalPnL_USD / state.initialCapitalUSD) * 100).toFixed(2);
      pos.closePrice = closePrice;
      pos.closeTime = nowIso;
      pos.closeTimestamp = now;
      pos.status = 'MANUEL_KAPANDI';
      pos.exitReason = `Kullanıcı tarafından canlı piyasa kotasyonundan (@ ${closePrice}) manuel kapatıldı (Toplam IBKR komisyonu: -$${(pos.executionCostUSD || 0).toFixed(2)}).`;

      state.openPositions.splice(idx, 1);
      state.closedTrades.unshift(pos);
      state.activityLog.unshift({
        id: `MAN-CLS-${now}-${pos.id}`,
        timestamp: nowIso,
        type: 'SYSTEM',
        symbol: pos.symbol,
        pnlImpactUSD: netDelta,
        message: `MANUEL KAPANIŞ: ${pos.symbol} (${pos.direction}) ${pos.entryPrice} → ${closePrice} | İşlem Neti: ${pos.totalPnL_USD >= 0 ? '+' : '-'}$${Math.abs(pos.totalPnL_USD).toFixed(2)}.`,
      });
    }

    if (state.openPositions.length > 0) {
      applyOpenPositionsValuation(state, snap.marketMap, now, nowIso);
    }
    recalculateLedgerMetrics(state);
    state.equityCurve.push({
      timestamp: now,
      timeStr: new Date(now).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      equityUSD: state.totalEquityUSD,
      cashUSD: state.cashBalanceUSD,
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
      applyOpenPositionsValuation(state, snap.marketMap, now, nowIso);
    }
    recalculateLedgerMetrics(state);
    saveManualLedger(state);

    return buildArenaResponse(state, botState, snap.marketMap, new Date(now));
  });
}

export async function resetManualArena(initialCapitalUSD = INITIAL_CAPITAL_USD): Promise<ManualArenaResponse> {
  return withManualLock(async () => {
    const [botState, snap] = await Promise.all([loadOrInitAutonomousLedger(), fetchUniverseSnapshot()]);
    const clean = createCleanManualLedger(initialCapitalUSD, snap.usdTry);
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
        marginUSD: Number(body.marginUSD ?? body.marginTRY),
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
      payload = await resetManualArena(INITIAL_CAPITAL_USD);
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
