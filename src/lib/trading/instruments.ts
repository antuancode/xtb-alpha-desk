import type { Instrument } from "./types";

export const INSTRUMENTS: Instrument[] = [
  // Forex
  { id: "EURUSD", name: "Euro / Dólar", assetClass: "forex", yahoo: "EURUSD=X", xtb: "EURUSD", contractSize: 100000, digits: 5 },
  { id: "GBPUSD", name: "Libra / Dólar", assetClass: "forex", yahoo: "GBPUSD=X", xtb: "GBPUSD", contractSize: 100000, digits: 5 },
  { id: "USDJPY", name: "Dólar / Yen", assetClass: "forex", yahoo: "USDJPY=X", xtb: "USDJPY", contractSize: 100000, digits: 3 },
  { id: "AUDUSD", name: "Dólar Aus. / Dólar", assetClass: "forex", yahoo: "AUDUSD=X", xtb: "AUDUSD", contractSize: 100000, digits: 5 },
  { id: "USDCHF", name: "Dólar / Franco", assetClass: "forex", yahoo: "USDCHF=X", xtb: "USDCHF", contractSize: 100000, digits: 5 },

  // Índices
  { id: "US500", name: "S&P 500", assetClass: "index", yahoo: "^GSPC", xtb: "US500", contractSize: 1, digits: 2 },
  { id: "US100", name: "Nasdaq 100", assetClass: "index", yahoo: "^NDX", xtb: "US100", contractSize: 1, digits: 2 },
  { id: "DE40", name: "DAX 40", assetClass: "index", yahoo: "^GDAXI", xtb: "DE40", contractSize: 1, digits: 2 },

  // Acciones
  { id: "AAPL", name: "Apple", assetClass: "stock", yahoo: "AAPL", xtb: "AAPL.US", contractSize: 1, digits: 2 },
  { id: "MSFT", name: "Microsoft", assetClass: "stock", yahoo: "MSFT", xtb: "MSFT.US", contractSize: 1, digits: 2 },
  { id: "NVDA", name: "NVIDIA", assetClass: "stock", yahoo: "NVDA", xtb: "NVDA.US", contractSize: 1, digits: 2 },
  { id: "TSLA", name: "Tesla", assetClass: "stock", yahoo: "TSLA", xtb: "TSLA.US", contractSize: 1, digits: 2 },

  // Materias primas
  { id: "GOLD", name: "Oro", assetClass: "commodity", yahoo: "GC=F", xtb: "GOLD", contractSize: 100, digits: 2 },
  { id: "SILVER", name: "Plata", assetClass: "commodity", yahoo: "SI=F", xtb: "SILVER", contractSize: 5000, digits: 3 },
  { id: "OIL", name: "Petróleo WTI", assetClass: "commodity", yahoo: "CL=F", xtb: "OIL.WTI", contractSize: 1000, digits: 2 },

  // Cripto
  { id: "BITCOIN", name: "Bitcoin", assetClass: "crypto", yahoo: "BTC-USD", xtb: "BITCOIN", contractSize: 1, digits: 2, alwaysOpen: true },
  { id: "ETHEREUM", name: "Ethereum", assetClass: "crypto", yahoo: "ETH-USD", xtb: "ETHEREUM", contractSize: 1, digits: 2, alwaysOpen: true },
  { id: "SOLANA", name: "Solana", assetClass: "crypto", yahoo: "SOL-USD", xtb: "SOLANA", contractSize: 1, digits: 2, alwaysOpen: true },
];

export const INSTRUMENT_MAP: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
);

export const ASSET_CLASS_LABEL: Record<Instrument["assetClass"], string> = {
  forex: "Forex",
  index: "Índices",
  stock: "Acciones",
  commodity: "Materias primas",
  crypto: "Cripto",
};

export const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "GOLD", "US500", "BITCOIN", "ETHEREUM", "NVDA", "OIL"];
