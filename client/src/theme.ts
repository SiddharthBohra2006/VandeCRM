export interface ThemePreset {
  name: string;
  description: string;
  type: 'dark' | 'light';
  gold: string;
  teal: string;
  bg: string;
  surface: string;
  text: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: 'Vande Classic Dark', description: 'Midnight Slate', type: 'dark', gold: '#ffcc00', teal: '#00bcd4', bg: '#090d16', surface: '#121b2d', text: '#f8fafc' },
  { name: 'Vande OLED Black', description: 'Pure Jet Black', type: 'dark', gold: '#ffcc00', teal: '#a855f7', bg: '#000000', surface: '#0e0e11', text: '#eeeeee' },
  { name: 'Vande Cozy Cream', description: 'Warm Bamboo', type: 'light', gold: '#d97706', teal: '#0f766e', bg: '#fcfaf7', surface: '#ffffff', text: '#1c1917' },
  { name: 'Vande Crystal Light', description: 'Cool Ice Slate', type: 'light', gold: '#b58d00', teal: '#2563eb', bg: '#f1f5f9', surface: '#ffffff', text: '#0f172a' },
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
