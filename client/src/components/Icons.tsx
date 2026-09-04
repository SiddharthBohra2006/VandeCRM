import { SVGProps } from 'react';
import {
  LayoutDashboard, Users, Briefcase, Megaphone, ClipboardList, CheckSquare,
  Building2, UsersRound, Mail, Plug, Settings, ScrollText, LayoutGrid,
  BarChart3, FileText, ChevronsUpDown, Check, Plus, ListTodo, Clapperboard,
  Palette, Globe, PenLine, Image as ImageIcon, SquareCheckBig, Search,
  Sparkles, ListChecks, Calendar, UserPlus, Clock, TriangleAlert, Target,
  Filter, Video, X, RotateCcw, ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Name -> Lucide component map. Keeps the same <Icon name="..."/> API used by
// Sidebar/TopBar so pages never change, but renders real Lucide icons
// (pixel-identical stroke/style to the EJS `<i data-lucide="...">` catalog).
const lucideMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  briefcase: Briefcase,
  megaphone: Megaphone,
  'clipboard-list': ClipboardList,
  'check-square': CheckSquare,
  'square-check-big': SquareCheckBig,
  'building-2': Building2,
  'users-round': UsersRound,
  'user-round': UsersRound,
  mail: Mail,
  plug: Plug,
  settings: Settings,
  'scroll-text': ScrollText,
  'layout-grid': LayoutGrid,
  'bar-chart-3': BarChart3,
  'file-text': FileText,
  'chevrons-up-down': ChevronsUpDown,
  check: Check,
  plus: Plus,
  'list-todo': ListTodo,
  'list-checks': ListChecks,
  clapperboard: Clapperboard,
  palette: Palette,
  globe: Globe,
  'pen-line': PenLine,
  image: ImageIcon,
  search: Search,
  sparkles: Sparkles,
  calendar: Calendar,
  'user-plus': UserPlus,
  clock: Clock,
  'triangle-alert': TriangleAlert,
  video: Video,
  target: Target,
  filter: Filter,
  x: X,
  'rotate-ccw': RotateCcw,
  'arrow-up-right': ArrowUpRight,
};

// Map Emoji/key-based work-module icons (EJS uses these in a moduleIcons table)
// and unknown names to sensible Lucide icons so nothing renders blank.
const legacyToLucide: Record<string, LucideIcon> = {
  '✅': SquareCheckBig,
  '🎬': Clapperboard,
  '🎨': Palette,
  '🌐': Globe,
  '✍️': PenLine,
  '📋': ClipboardList,
  check_square: SquareCheckBig,
  video: Clapperboard,
  file_text: PenLine,
  clipboard: ClipboardList,
  graphic_post: ImageIcon,
  design: Palette,
  task: SquareCheckBig,
};

function resolved(name: string | undefined): LucideIcon {
  if (!name) return ClipboardList;
  if (lucideMap[name]) return lucideMap[name];
  if (legacyToLucide[name]) return legacyToLucide[name];
  return ClipboardList;
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
}

export function resolveIconName(name: string | undefined): string {
  if (!name) return 'clipboard-list';
  if (lucideMap[name]) return name;
  return 'clipboard-list';
}

export default function Icon({ name, size = 16, ...props }: IconProps) {
  const Cmp = resolved(name);
  const { className, ...rest } = props;
  return <Cmp size={size} className={className} {...(rest as any)} />;
}

export { Icon };