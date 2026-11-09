/**
 * Number formatting for readouts. See NumberFormatSchema in theme-schema for
 * the supported tokens: "0", "0.00", "00", "+0", "0,0" and literal text.
 */

export interface ParsedFormat {
  prefix: string;
  suffix: string;
  decimals: number;
  minIntegerDigits: number;
  forceSign: boolean;
  thousands: boolean;
}

const cache = new Map<string, ParsedFormat>();

export function parseFormat(fmt: string): ParsedFormat {
  const cached = cache.get(fmt);
  if (cached) return cached;
  const m = /^(.*?)(\+?)(0[0,]*)(?:\.(0+))?(.*)$/s.exec(fmt);
  let parsed: ParsedFormat;
  if (!m) {
    parsed = {
      prefix: '',
      suffix: fmt,
      decimals: 0,
      minIntegerDigits: 1,
      forceSign: false,
      thousands: false,
    };
  } else {
    const intPart = m[3]!;
    parsed = {
      prefix: m[1]!,
      forceSign: m[2] === '+',
      minIntegerDigits: intPart.replace(/,/g, '').length,
      thousands: intPart.includes(','),
      decimals: m[4]?.length ?? 0,
      suffix: m[5]!,
    };
  }
  cache.set(fmt, parsed);
  return parsed;
}

export function formatNumber(value: number, fmt = '0'): string {
  const f = parseFormat(fmt);
  if (!Number.isFinite(value)) return `${f.prefix}--${f.suffix}`;
  const rounded = Math.abs(value).toFixed(f.decimals);
  const [intRaw, frac] = rounded.split('.');
  let int = intRaw!.padStart(f.minIntegerDigits, '0');
  if (f.thousands) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const negative = value < 0 && Number(rounded) !== 0;
  const sign = negative ? '-' : f.forceSign ? '+' : '';
  return `${f.prefix}${sign}${int}${frac ? '.' + frac : ''}${f.suffix}`;
}

/** Placeholder shown for stale or unavailable values, matching the format's width. */
export function formatDash(fmt = '0'): string {
  const f = parseFormat(fmt);
  const width = Math.max(1, f.minIntegerDigits) + (f.decimals ? f.decimals + 1 : 0);
  return `${f.prefix}${'-'.repeat(Math.min(width, 4))}${f.suffix}`;
}

export function formatClock(
  hours: number,
  minutes: number,
  seconds: number,
  opts: { format: '24h' | '12h'; showSeconds: boolean; showSuffix: boolean; colon?: boolean },
): string {
  const colon = opts.colon === false ? ' ' : ':';
  let h = hours;
  let suffix = '';
  if (opts.format === '12h') {
    suffix = h >= 12 ? ' PM' : ' AM';
    h = h % 12;
    if (h === 0) h = 12;
  }
  const hh = opts.format === '24h' ? String(h).padStart(2, '0') : String(h);
  const mm = String(minutes).padStart(2, '0');
  const ss = opts.showSeconds ? `${colon}${String(seconds).padStart(2, '0')}` : '';
  return `${hh}${colon}${mm}${ss}${opts.showSuffix ? suffix : ''}`;
}
