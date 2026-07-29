import { atr, bollinger, detectPatterns, ema, keyLevels, macd, rsi, trendStrength } from "./indicators";
import type { Analysis, BotConfig, Candle, NewsItem, Side } from "./types";

export interface RiskProfile {
  label: string;
  minConfidence: number;
  atrStopMult: number;
  rewardRatio: number;
  riskMultiplier: number;
  maxPositionsBoost: number;
}

/** Traduce la agresividad (1-10) a parámetros de riesgo concretos */
export function riskProfile(aggressiveness: number): RiskProfile {
  const a = Math.min(10, Math.max(1, aggressiveness));
  const labels = [
    "Ultra conservador",
    "Muy conservador",
    "Conservador",
    "Prudente",
    "Equilibrado",
    "Equilibrado+",
    "Dinámico",
    "Agresivo",
    "Muy agresivo",
    "Extremo",
  ];
  return {
    label: labels[a - 1],
    // Menos agresivo => exige más confianza para entrar
    minConfidence: Math.round(80 - (a - 1) * 4.2),
    // Menos agresivo => stop más ancho relativo al objetivo y objetivos modestos
    atrStopMult: +(2.6 - (a - 1) * 0.13).toFixed(2),
    rewardRatio: +(1.4 + (a - 1) * 0.18).toFixed(2),
    riskMultiplier: +(0.45 + (a - 1) * 0.17).toFixed(2),
    maxPositionsBoost: Math.floor((a - 1) / 3),
  };
}

/** Ajuste automático de riesgo según volatilidad y racha reciente */
export function adaptiveRiskFactor(volatilityPct: number, recentWinRate: number, drawdownPct: number): number {
  let f = 1;
  if (volatilityPct > 3) f *= 0.6;
  else if (volatilityPct > 1.5) f *= 0.8;
  else if (volatilityPct < 0.4) f *= 1.15;

  if (recentWinRate >= 0.6) f *= 1.15;
  else if (recentWinRate <= 0.35) f *= 0.7;

  if (drawdownPct > 10) f *= 0.5;
  else if (drawdownPct > 5) f *= 0.75;

  return Math.min(1.6, Math.max(0.25, f));
}

/** Análisis multi-factor de un instrumento */
export function analyze(symbol: string, candles: Candle[], news: NewsItem[] = []): Analysis | null {
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1];

  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = atr(candles, 14);
  const bb = bollinger(closes, 20, 2);
  const adx = trendStrength(candles);
  const patterns = detectPatterns(candles);
  const levels = keyLevels(candles);

  const last = closes.length - 1;
  const atrV = a[last];
  const volatilityPct = (atrV / price) * 100;

  let score = 0;
  const reasons: string[] = [];

  // 1. Cruce de medias
  if (e9[last] > e21[last]) {
    score += 18;
    reasons.push("EMA9 sobre EMA21 (impulso alcista)");
  } else {
    score -= 18;
    reasons.push("EMA9 bajo EMA21 (impulso bajista)");
  }

  // 2. Tendencia principal
  if (price > e50[last]) {
    score += 14;
    reasons.push("Precio sobre EMA50 (tendencia principal alcista)");
  } else {
    score -= 14;
    reasons.push("Precio bajo EMA50 (tendencia principal bajista)");
  }

  // 3. MACD
  const histPrev = m.hist[last - 1];
  if (m.hist[last] > 0 && m.hist[last] > histPrev) {
    score += 14;
    reasons.push("Histograma MACD positivo y creciendo");
  } else if (m.hist[last] < 0 && m.hist[last] < histPrev) {
    score -= 14;
    reasons.push("Histograma MACD negativo y decreciendo");
  }

  // 4. RSI
  const rv = r[last];
  if (rv < 30) {
    score += 16;
    reasons.push(`RSI ${rv.toFixed(0)}: sobreventa`);
  } else if (rv > 70) {
    score -= 16;
    reasons.push(`RSI ${rv.toFixed(0)}: sobrecompra`);
  } else if (rv > 50) {
    score += 6;
  } else {
    score -= 6;
  }

  // 5. Bandas de Bollinger
  if (price <= bb.lower[last]) {
    score += 10;
    reasons.push("Precio en banda inferior de Bollinger");
  } else if (price >= bb.upper[last]) {
    score -= 10;
    reasons.push("Precio en banda superior de Bollinger");
  }

  // 6. Patrones de vela
  for (const p of patterns) {
    score += p.bias * 9;
    if (p.bias !== 0) reasons.push(`Patrón: ${p.name}`);
  }

  // 7. Momento a corto plazo
  const mom = ((price - closes[last - 10]) / closes[last - 10]) * 100;
  score += Math.max(-12, Math.min(12, mom * 4));

  // 8. Noticias
  const relevant = news.filter((n) => n.symbols.includes(symbol));
  if (relevant.length) {
    const sent = relevant.reduce((s, n) => s + n.sentiment, 0) / relevant.length;
    score += sent * 15;
    reasons.push(
      `${relevant.length} noticia(s) con sesgo ${sent > 0.15 ? "positivo" : sent < -0.15 ? "negativo" : "neutro"}`,
    );
  }

  // 9. Proximidad a soporte/resistencia
  if (Number.isFinite(levels.resistance) && (levels.resistance - price) / price < 0.002) {
    score -= 8;
    reasons.push("Resistencia inmediata cercana");
  }
  if (Number.isFinite(levels.support) && (price - levels.support) / price < 0.002) {
    score += 8;
    reasons.push("Apoyo en soporte cercano");
  }

  score = Math.max(-100, Math.min(100, score));
  // La confianza mezcla fuerza de la señal con fuerza de la tendencia
  const confidence = Math.round(Math.min(100, Math.abs(score) * 0.75 + adx * 0.25));

  const trend = e9[last] > e21[last] && price > e50[last] ? "alcista" : e9[last] < e21[last] && price < e50[last] ? "bajista" : "lateral";

  return {
    symbol,
    price,
    trend,
    score: Math.round(score),
    confidence,
    atr: atrV,
    rsi: rv,
    emaFast: e9[last],
    emaSlow: e21[last],
    macdHist: m.hist[last],
    volatilityPct,
    reasons,
    suggestion: score >= 25 ? "BUY" : score <= -25 ? "SELL" : "ESPERAR",
  };
}

export interface TradePlan {
  symbol: string;
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  volume: number;
  confidence: number;
  reason: string;
}

export function buildTradePlan(
  analysis: Analysis,
  config: BotConfig,
  tradableCapital: number,
  contractSize: number,
  riskFactor: number,
): TradePlan | null {
  const profile = riskProfile(config.aggressiveness);
  if (analysis.suggestion === "ESPERAR") return null;
  if (analysis.confidence < profile.minConfidence) return null;

  const side = analysis.suggestion;
  const entry = analysis.price;
  const stopDistance = Math.max(analysis.atr * profile.atrStopMult, entry * 0.0015);
  const stopLoss = side === "BUY" ? entry - stopDistance : entry + stopDistance;
  const takeProfit =
    side === "BUY" ? entry + stopDistance * profile.rewardRatio : entry - stopDistance * profile.rewardRatio;

  const riskAmount = tradableCapital * (config.riskPerTradePct / 100) * profile.riskMultiplier * riskFactor;
  if (riskAmount <= 0) return null;

  const rawVolume = riskAmount / (stopDistance * contractSize);
  const volume = Math.max(0.01, Math.round(rawVolume * 100) / 100);
  if (!Number.isFinite(volume) || volume <= 0) return null;

  return {
    symbol: analysis.symbol,
    side,
    entry,
    stopLoss,
    takeProfit,
    riskAmount,
    volume,
    confidence: analysis.confidence,
    reason: analysis.reasons.slice(0, 3).join(" · "),
  };
}
