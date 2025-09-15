export function formatCurrencyUSD(n: any) {
  const val = Number(n);
  if (!isFinite(val)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val);
}

export function formatPercent(n: any, digits = 2) {
  const val = Number(n);
  if (!isFinite(val)) return '—';
  return `${val.toFixed(digits)}%`;
}

export function formatNumber(n: any, digits = 2) {
  const val = Number(n);
  if (!isFinite(val)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(val);
}

export function formatDate(d: any) {
  const dt = d ? new Date(d) : null;
  return dt && !isNaN(+dt) ? dt.toLocaleDateString() : '—';
}

