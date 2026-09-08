import { SVGProps } from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function toPascalCase(str: string): string {
  return str
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Special alias mapping for legacy keys / emoji symbols / short names
const legacyAliases: Record<string, string> = {
  '✅': 'SquareCheckBig',
  '🎬': 'Clapperboard',
  '🎨': 'Palette',
  '🌐': 'Globe',
  '✍️': 'PenLine',
  '📋': 'ClipboardList',
  whatsapp: 'MessageCircle',
  rupee: 'IndianRupee',
  payment: 'IndianRupee',
  payments: 'IndianRupee',
  graphic_post: 'Image',
  design: 'Palette',
  task: 'SquareCheckBig',
  tasks: 'SquareCheckBig',
  video: 'Clapperboard',
  videos: 'Clapperboard',
  image: 'Image',
};

function resolved(name: string | undefined): LucideIcon {
  if (!name) return LucideIcons.ClipboardList;

  // Check aliases first
  const aliasTarget = legacyAliases[name];
  if (aliasTarget && (LucideIcons as any)[aliasTarget]) {
    return (LucideIcons as any)[aliasTarget];
  }

  // Convert kebab-case / snake_case to PascalCase for Lucide lookup
  const pascal = toPascalCase(name);
  if ((LucideIcons as any)[pascal]) {
    return (LucideIcons as any)[pascal];
  }

  // Direct case match
  if ((LucideIcons as any)[name]) {
    return (LucideIcons as any)[name];
  }

  return LucideIcons.ClipboardList;
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
}

export function resolveIconName(name: string | undefined): string {
  if (!name) return 'clipboard-list';
  return name;
}

export default function Icon({ name, size = 16, ...props }: IconProps) {
  const Cmp = resolved(name);
  const { className, ...rest } = props;
  return <Cmp size={size} className={className} {...(rest as any)} />;
}

export { Icon };