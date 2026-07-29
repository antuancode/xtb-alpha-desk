export function fmtMoney(v: number, currency = "€", digits = 2) {
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${currency}`;
}

export function fmtSigned(v: number, currency = "€") {
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function fmtPct(v: number, digits = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtPrice(v: number, digits = 4) {
  return v.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDateTime(t: number) {
  return new Date(t).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
