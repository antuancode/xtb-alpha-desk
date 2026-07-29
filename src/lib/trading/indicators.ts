import type { Candle } from "./types";

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : values[i]);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [50];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      avgGain = (avgGain * (i - 1) + gain) / i;
      avgLoss = (avgLoss * (i - 1) + loss) / i;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line = fastE.map((v, i) => v - slowE[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

export function atr(candles: Candle[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].c : c.o;
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose)));
  }
  return ema(trs, period);
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    upper.push(mean + mult * sd);
    lower.push(mean - mult * sd);
  }
  return { mid, upper, lower };
}

/** Fuerza de tendencia simplificada tipo ADX (0..100) */
export function trendStrength(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 0;
  const slice = candles.slice(-period - 1);
  let up = 0;
  let down = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i].c - slice[i - 1].c;
    if (d > 0) up += d;
    else down -= d;
  }
  const total = up + down;
  if (total === 0) return 0;
  return Math.min(100, (Math.abs(up - down) / total) * 100);
}

/** Detección de patrones de velas clásicos */
export function detectPatterns(candles: Candle[]): { name: string; bias: number }[] {
  const out: { name: string; bias: number }[] = [];
  if (candles.length < 3) return out;
  const [a, b, c] = candles.slice(-3);
  const body = (x: Candle) => Math.abs(x.c - x.o);
  const range = (x: Candle) => Math.max(x.h - x.l, 1e-9);

  if (c.c > c.o && b.c < b.o && c.c >= b.o && c.o <= b.c) out.push({ name: "Envolvente alcista", bias: 1 });
  if (c.c < c.o && b.c > b.o && c.o >= b.c && c.c <= b.o) out.push({ name: "Envolvente bajista", bias: -1 });

  const lowerWick = Math.min(c.o, c.c) - c.l;
  const upperWick = c.h - Math.max(c.o, c.c);
  if (lowerWick > body(c) * 2 && upperWick < body(c)) out.push({ name: "Martillo", bias: 1 });
  if (upperWick > body(c) * 2 && lowerWick < body(c)) out.push({ name: "Estrella fugaz", bias: -1 });
  if (body(c) / range(c) < 0.1) out.push({ name: "Doji (indecisión)", bias: 0 });

  if (a.c < a.o && b.c < b.o && c.c > c.o && c.c > (a.o + a.c) / 2)
    out.push({ name: "Tres soldados / giro alcista", bias: 1 });
  if (a.c > a.o && b.c > b.o && c.c < c.o && c.c < (a.o + a.c) / 2)
    out.push({ name: "Tres cuervos / giro bajista", bias: -1 });

  return out;
}

/** Soportes y resistencias por fractales */
export function keyLevels(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-lookback);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    const w = slice.slice(i - 2, i + 3);
    if (slice[i].h === Math.max(...w.map((x) => x.h))) highs.push(slice[i].h);
    if (slice[i].l === Math.min(...w.map((x) => x.l))) lows.push(slice[i].l);
  }
  return {
    resistance: highs.length ? Math.min(...highs.filter((h) => h >= slice[slice.length - 1].c), Infinity) : Infinity,
    support: lows.length ? Math.max(...lows.filter((l) => l <= slice[slice.length - 1].c), -Infinity) : -Infinity,
  };
}
