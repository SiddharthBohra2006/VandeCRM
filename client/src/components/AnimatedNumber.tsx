import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedNumber — counts a KPI number up from 0 (first render) or from its
 * previous value (later updates). Purely visual: the final text is always
 * exactly what you passed in.
 *
 * Accepts numbers or already-formatted strings with ONE numeric run:
 *   42  |  "42"  |  "73%"  |  "Rs. 1,23,456"  |  "₹12,500.50"  |  "1.2K"
 * Anything it cannot parse safely ("4 / 10", "12h 30m", "—", "") is shown
 * unchanged with no animation.
 *
 * Costs: one requestAnimationFrame loop (~800 ms) per instance, only when the
 * value changes. Skipped entirely for prefers-reduced-motion, hidden tabs,
 * zero, and very large numbers.
 */

type Props = {
  value: string | number | null | undefined;
  /** milliseconds, default 800 */
  duration?: number;
  /** ms to wait before the FIRST count-up (lets the card finish rising). Default 200 */
  delay?: number;
  className?: string;
};

type Grouping = 'none' | 'en-US' | 'en-IN';

interface Parsed {
  prefix: string;
  suffix: string;
  target: number;
  decimals: number;
  grouping: Grouping;
}

const PARTS = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;
const INDIAN_GROUPING = /^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/;

function parse(value: string | number | null | undefined): Parsed | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const m = PARTS.exec(text);
  if (!m) return null;
  const [, prefix, numText, suffix] = m;
  const target = Number(numText.replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0 || Math.abs(target) > 1e12) return null;
  const decimals = numText.includes('.') ? numText.split('.')[1].length : 0;
  const grouping: Grouping = numText.includes(',')
    ? (INDIAN_GROUPING.test(numText) ? 'en-IN' : 'en-US')
    : 'none';
  return { prefix, suffix, target, decimals, grouping };
}

function format(n: number, p: Parsed): string {
  const body = n.toLocaleString(p.grouping === 'en-IN' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
    useGrouping: p.grouping !== 'none',
  });
  return `${p.prefix}${body}${p.suffix}`;
}

function canAnimate(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.hidden) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AnimatedNumber({ value, duration = 800, delay = 200, className }: Props) {
  const raw = value === null || value === undefined ? '' : String(value);
  const parsed = parse(raw);

  const shown = useRef(0);            // number currently on screen
  const frame = useRef<number | null>(null);
  const [text, setText] = useState<string>(() =>
    parsed && canAnimate() ? format(0, parsed) : raw
  );

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    const p = parse(raw);
    if (!p || !canAnimate()) {
      shown.current = p ? p.target : 0;
      setText(raw);
      return;
    }

    const from = shown.current;
    const to = p.target;
    if (from === to) {
      setText(raw);
      return;
    }
    const start = performance.now() + (from === 0 ? delay : 0);

    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      const current = from + (to - from) * eased;
      shown.current = current;
      if (t < 1) {
        setText(format(current, p));
        frame.current = requestAnimationFrame(tick);
      } else {
        shown.current = to;
        setText(raw); // always land on the exact original text
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [raw, duration, delay]);

  return <span className={className ? `mo-num ${className}` : 'mo-num'}>{text}</span>;
}
