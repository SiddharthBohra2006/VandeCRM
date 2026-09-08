export interface ThemePreset {
  name: string;
  description: string;
  type: 'dark' | 'light';
  gold: string;
  teal: string;
  bg: string;
  surface: string;
  text: string;
  dotBg?: string;
  dotBorder?: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Midnight Slate',
    description: 'Executive dark navy & amber gold',
    type: 'dark',
    gold: '#f59e0b',
    teal: '#06b6d4',
    bg: '#080d1a',
    surface: '#0f172a',
    text: '#f8fafc',
    dotBg: '#0f172a',
    dotBorder: '#f59e0b',
  },
  {
    name: 'Cyber Violet',
    description: 'Futuristic obsidian & neon violet',
    type: 'dark',
    gold: '#c084fc',
    teal: '#f43f5e',
    bg: '#06030e',
    surface: '#120926',
    text: '#faf5ff',
    dotBg: '#581c87',
    dotBorder: '#c084fc',
  },
  {
    name: 'Warm Sand',
    description: 'Kyoto linen cream & warm terracotta',
    type: 'light',
    gold: '#c2410c',
    teal: '#0f766e',
    bg: '#faf5ed',
    surface: '#ffffff',
    text: '#1c1917',
    dotBg: '#fbf5eb',
    dotBorder: '#c2410c',
  },
  {
    name: 'Nordic Indigo',
    description: 'Glacier slate white & royal indigo',
    type: 'light',
    gold: '#2563eb',
    teal: '#0284c7',
    bg: '#eef2f6',
    surface: '#ffffff',
    text: '#0f172a',
    dotBg: '#e0f2fe',
    dotBorder: '#2563eb',
  },
];

export function applyThemePreset(preset: ThemePreset) {
  const root = document.documentElement;
  root.setAttribute('data-theme', preset.type);
  root.classList.toggle('dark-theme', preset.type === 'dark');
  const s = root.style;
  s.setProperty('--gold', preset.gold);
  s.setProperty('--gold-dim', `color-mix(in srgb, ${preset.gold} 10%, transparent)`);
  s.setProperty('--gold-hover', `color-mix(in srgb, ${preset.gold} 85%, black)`);
  s.setProperty('--teal', preset.teal);
  s.setProperty('--teal-dim', `color-mix(in srgb, ${preset.teal} 10%, transparent)`);
  s.setProperty('--bg', preset.bg);
  s.setProperty('--bg-soft', `color-mix(in srgb, ${preset.bg} 92%, ${preset.text})`);
  s.setProperty('--panel', preset.surface);
  s.setProperty('--panel-2', preset.surface);
  s.setProperty('--panel-muted', `color-mix(in srgb, ${preset.surface} 95%, ${preset.text})`);
  s.setProperty('--input', `color-mix(in srgb, ${preset.surface} 96%, ${preset.text})`);
  s.setProperty('--text', preset.text);
  s.setProperty('--muted', `color-mix(in srgb, ${preset.surface} 45%, ${preset.text})`);
  s.setProperty('--sub', `color-mix(in srgb, ${preset.surface} 30%, ${preset.text})`);
  s.setProperty('--hover', `color-mix(in srgb, ${preset.surface} 94%, ${preset.text})`);
  s.setProperty('--border', `color-mix(in srgb, ${preset.surface} 88%, ${preset.text})`);
  s.setProperty('--border-strong', `color-mix(in srgb, ${preset.surface} 80%, ${preset.text})`);
  localStorage.setItem('theme-name', preset.name);
  localStorage.setItem('theme-preset', JSON.stringify(preset));
  localStorage.setItem('theme', preset.type);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm-theme-changed', { detail: preset }));
  }
}

export function getActiveThemePreset(): ThemePreset {
  if (typeof window === 'undefined') return THEME_PRESETS[0];
  const savedName = localStorage.getItem('theme-name');
  if (savedName) {
    const found = THEME_PRESETS.find(p => p.name === savedName);
    if (found) return found;
  }
  return THEME_PRESETS[0];
}

// ─── Cinematic Awakening Engine ───────────────────────────────────────────────

/** Get or create a fixed, zero-overflow viewport container for all theme animations */
function getFxContainer(): HTMLElement {
  let container = document.getElementById('theme-fx-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'theme-fx-container';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);
  }
  return container;
}

/** Spawn a DOM node inside the FX container, auto-remove after duration */
function spawnEl(tag: string, className: string, styles: Record<string, string>, duration: number): HTMLElement {
  const container = getFxContainer();
  const el = document.createElement(tag);
  el.className = className;
  Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v));
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
  return el;
}

/** Fire scattered firefly particles from the click origin */
function spawnFireflies(x: number, y: number, color: string) {
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist  = 55 + Math.random() * 90;
    const size  = 3 + Math.random() * 5;
    const dur   = 700 + Math.random() * 400;
    const delay = Math.random() * 120;

    spawnEl('div', 'theme-firefly', {
      left:                `${x}px`,
      top:                 `${y}px`,
      '--theme-glow-color': color,
      '--ff-size':         `${size}px`,
      '--ff-dx':           `${Math.cos(angle) * dist}px`,
      '--ff-dy':           `${Math.sin(angle) * dist}px`,
      '--ff-duration':     `${dur}ms`,
      '--ff-delay':        `${delay}ms`,
    }, dur + delay + 50);
  }
}

/** The supernova flash at the exact click point */
function spawnSupernova(x: number, y: number, color: string) {
  spawnEl('div', 'theme-supernova', {
    left:                `${x}px`,
    top:                 `${y}px`,
    width:               '80px',
    height:              '80px',
    '--theme-glow-color': color,
  }, 500);
}

/** Dual concentric aurora rings that expand outward */
function spawnAuroraRings(x: number, y: number, color: string, endRadius: number) {
  const size   = 60;
  const scale  = (endRadius / (size / 2)) * 1.1;
  const dur    = 750;

  ['theme-aurora-ring', 'theme-aurora-ring-2'].forEach(cls => {
    spawnEl('div', cls, {
      left:                `${x}px`,
      top:                 `${y}px`,
      width:               `${size}px`,
      height:              `${size}px`,
      '--theme-glow-color': color,
      '--aurora-scale':    `${scale}`,
      '--aurora-duration': `${dur}ms`,
    }, dur + 200);
  });
}

/**
 * Sweeping Wavefront Lens:
 * Expands inside the overflow-clipped container in exact lockstep with the circular reveal.
 * Its glowing rim and backdrop-filter sweep across all typography, words, and cards,
 * creating a living radiant wave across the written content with ZERO scrollbar overflow.
 */
function spawnWavefrontLens(x: number, y: number, color: string, endRadius: number, duration: number) {
  const container = getFxContainer();
  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // 1. Radiant luminous lens with backdrop-filter that illuminates text
  const lens = document.createElement('div');
  lens.className = 'theme-wavefront-lens';
  lens.style.left = `${x}px`;
  lens.style.top = `${y}px`;
  lens.style.setProperty('--theme-glow-color', color);
  container.appendChild(lens);

  lens.animate([
    {
      width: '0px',
      height: '0px',
      opacity: 0.95,
      borderWidth: '3.5px',
    },
    {
      width: `${endRadius * 2}px`,
      height: `${endRadius * 2}px`,
      opacity: 0,
      borderWidth: '0.5px',
    }
  ], {
    duration,
    easing,
    fill: 'forwards'
  });

  // 2. Soft color energy wave halo
  const glow = document.createElement('div');
  glow.className = 'theme-wavefront-glow';
  glow.style.left = `${x}px`;
  glow.style.top = `${y}px`;
  glow.style.setProperty('--theme-glow-color', color);
  container.appendChild(glow);

  glow.animate([
    {
      width: '0px',
      height: '0px',
      opacity: 0.9,
    },
    {
      width: `${endRadius * 2.15}px`,
      height: `${endRadius * 2.15}px`,
      opacity: 0,
    }
  ], {
    duration: duration + 100,
    easing,
    fill: 'forwards'
  });

  setTimeout(() => {
    lens.remove();
    glow.remove();
    // Clean up container if empty
    if (container && container.childNodes.length === 0) {
      container.remove();
    }
  }, duration + 200);
}

export function changeThemeWithAnimation(
  preset: ThemePreset,
  event?: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }
) {
  const root = document.documentElement;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = event && 'clientX' in event && event.clientX > 0 ? event.clientX : window.innerWidth / 2;
  const y = event && 'clientY' in event && event.clientY > 0 ? event.clientY : 40;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  const isMobile = window.innerWidth <= 768;
  const REVEAL_DUR = isMobile ? 380 : 680;
  const color = preset.gold;

  if (prefersReduced) {
    applyThemePreset(preset);
    return;
  }

  // ── Desktop Cinematic Engine: particles & wavefront lens (bypassed on mobile for 60fps smoothness) ──
  if (!isMobile) {
    spawnSupernova(x, y, color);
    spawnFireflies(x, y, color);
    spawnAuroraRings(x, y, color, endRadius);
    spawnWavefrontLens(x, y, color, endRadius, REVEAL_DUR);
  }

  // ── Phase 4: Circular reveal via View Transitions API ──
  if ('startViewTransition' in document && typeof (document as any).startViewTransition === 'function') {
    try {
      const vt = (document as any).startViewTransition(() => applyThemePreset(preset));

      vt.ready.then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ]
          },
          {
            duration: REVEAL_DUR,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      }).catch(() => applyThemePreset(preset));
      return;
    } catch {
      // fall through to fallback
    }
  }

  // ── Fallback: smooth CSS variable cross-fade ──
  root.classList.add('theme-transitioning');
  applyThemePreset(preset);
  setTimeout(() => root.classList.remove('theme-transitioning'), REVEAL_DUR);
}

/** Legacy ripple overlay (kept for backward compat) */
export function applyThemeRipple(x: number, y: number, bg: string) {
  const ripple = document.createElement('div');
  ripple.id = 'theme-ripple-overlay';
  ripple.style.setProperty('--ripple-x', `${x}px`);
  ripple.style.setProperty('--ripple-y', `${y}px`);
  ripple.style.setProperty('--ripple-bg', bg);
  document.body.appendChild(ripple);
  ripple.offsetWidth;
  ripple.classList.add('expanding');
  setTimeout(() => ripple.remove(), 900);
}
