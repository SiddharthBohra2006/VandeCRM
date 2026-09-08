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


function spawnThemeShockwave(x: number, y: number, color: string, endRadius: number, duration: number) {
  try {
    const shockwave = document.createElement('div');
    shockwave.className = 'theme-shockwave-wavefront';
    shockwave.style.left = `${x}px`;
    shockwave.style.top = `${y}px`;
    shockwave.style.setProperty('--theme-glow-color', color);
    shockwave.style.setProperty('--theme-max-radius', `${endRadius}px`);
    shockwave.style.setProperty('--theme-duration', `${duration}ms`);
    document.body.appendChild(shockwave);

    const burst = document.createElement('div');
    burst.className = 'theme-click-burst';
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    burst.style.setProperty('--theme-glow-color', color);
    document.body.appendChild(burst);

    setTimeout(() => {
      shockwave.remove();
      burst.remove();
    }, duration + 150);
  } catch {
    // Ignore DOM overlay errors
  }
}

export function changeThemeWithAnimation(
  preset: ThemePreset,
  event?: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }
) {
  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = event && 'clientX' in event && event.clientX > 0 ? event.clientX : window.innerWidth / 2;
  const y = event && 'clientY' in event && event.clientY > 0 ? event.clientY : 40;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  const duration = 620;
  const accentColor = preset.gold || '#f59e0b';

  if (!prefersReducedMotion) {
    spawnThemeShockwave(x, y, accentColor, endRadius, duration);
  }

  // Modern View Transitions Circular Reveal Animation (Chrome 111+, Edge 111+, Safari 18+)
  if (!prefersReducedMotion && 'startViewTransition' in document && typeof (document as any).startViewTransition === 'function') {
    try {
      const transition = (document as any).startViewTransition(() => {
        applyThemePreset(preset);
      });

      transition.ready.then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`
            ]
          },
          {
            duration,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)'
          }
        );
      }).catch(() => {
        applyThemePreset(preset);
      });
      return;
    } catch {
      // Fallback if view transition is rejected or already in progress
    }
  }

  // Fallback smooth transition class for older browsers
  root.classList.add('theme-transitioning');
  applyThemePreset(preset);
  setTimeout(() => {
    root.classList.remove('theme-transitioning');
  }, duration);
}

export function applyThemeRipple(x: number, y: number, bg: string) {
  const ripple = document.createElement('div');
  ripple.id = 'theme-ripple-overlay';
  ripple.style.setProperty('--ripple-x', `${x}px`);
  ripple.style.setProperty('--ripple-y', `${y}px`);
  ripple.style.setProperty('--ripple-bg', bg);
  document.body.appendChild(ripple);
  ripple.offsetWidth;
  ripple.classList.add('expanding');
  setTimeout(() => {
    ripple.remove();
  }, 900);
}

