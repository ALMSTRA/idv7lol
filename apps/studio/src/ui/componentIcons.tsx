import {
  ArrowLeft,
  ArrowRight,
  Circle,
  CircleDashed,
  Clock,
  Cog,
  Gauge,
  Group,
  Hash,
  Image,
  Minus,
  Rows3,
  SlidersHorizontal,
  Square,
  TriangleAlert,
  Type,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from '@idv7lol/theme-schema';
import type { LibraryEntry } from '../lib/componentLibrary.js';

const BY_TYPE: Record<ComponentType, LucideIcon> = {
  'gauge.arc': Gauge,
  'gauge.bar': SlidersHorizontal,
  'value.digital': Hash,
  'indicator.gear': Cog,
  'indicator.shiftlights': Zap,
  clock: Clock,
  telltale: TriangleAlert,
  'status.panel': Rows3,
  text: Type,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  arc: CircleDashed,
  image: Image,
  group: Group,
};

export function TypeIcon({ type, size = 15 }: { type: ComponentType; size?: number }): JSX.Element {
  const Icon = BY_TYPE[type];
  return <Icon size={size} />;
}

export function EntryIcon({
  entry,
  size = 16,
}: {
  entry: LibraryEntry;
  size?: number;
}): JSX.Element {
  if (entry.id === 'turn-left') return <ArrowLeft size={size} />;
  if (entry.id === 'turn-right') return <ArrowRight size={size} />;
  return <TypeIcon type={entry.type} size={size} />;
}
