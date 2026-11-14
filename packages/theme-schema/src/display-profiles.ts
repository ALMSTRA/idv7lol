import type { ReservedZone } from './theme.js';

/**
 * Physical display profiles of the instrument clusters idv7lol can target.
 *
 * `verified` says whether this project confirmed the geometry on a car. The
 * iDrive 7 profile below reproduces the geometry that the Cluster Layouts app
 * (eroobeeroo/idrive7-cluster-info, GPL-3.0-or-later) uses on real cars; it is
 * shown as experimental in the Studio until idv7lol itself has been tested.
 */
export interface DisplayProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Diagonal in inches, informational. */
  diagonal: number;
  /** cluster-render target name that covers the whole display. */
  renderTarget: string;
  reservedZones: ReservedZone[];
  verified: boolean;
  notes: string;
}

/** The slanted glass corners: y < 217 - 0.55 * min(x, width - x). */
function cornerPolygons(width: number): ReservedZone[] {
  const run = 217 / 0.55; // x where the slant reaches y = 0
  return [
    {
      id: 'glass-corner-left',
      name: 'Glass corner (left)',
      kind: 'keep-clear',
      x: 0,
      y: 0,
      width: run,
      height: 217,
      polygon: [
        { x: 0, y: 0 },
        { x: run, y: 0 },
        { x: 0, y: 217 },
      ],
    },
    {
      id: 'glass-corner-right',
      name: 'Glass corner (right)',
      kind: 'keep-clear',
      x: width - run,
      y: 0,
      width: run,
      height: 217,
      polygon: [
        { x: width, y: 0 },
        { x: width - run, y: 0 },
        { x: width, y: 217 },
      ],
    },
  ];
}

export const DISPLAY_PROFILES: readonly DisplayProfile[] = [
  {
    id: 'kombi-id7-12.3',
    name: 'iDrive 7 instrument cluster 12.3" (1920×720)',
    width: 1920,
    height: 720,
    diagonal: 12.3,
    renderTarget: 'panel',
    verified: false,
    notes:
      'cluster-render "panel" target: slot 0x203, 1920×720, drawn above the factory gauges and below the ' +
      'factory telltales and pop-ups. The reserved zones mirror those used by Cluster Layouts on real cars. ' +
      'idv7lol has drawn on one car (a 2021 X4 M) but has not measured these zones there yet.',
    reservedZones: [
      {
        id: 'cowl',
        name: 'Top cowl (factory telltales)',
        kind: 'factory',
        x: 730,
        y: 0,
        width: 460,
        height: 128,
      },
      {
        id: 'gear-bracket',
        name: 'Gear bracket (factory gear display)',
        kind: 'factory',
        x: 1410,
        y: 262,
        width: 252,
        height: 192,
      },
      {
        id: 'edrive-box',
        name: 'eDrive status box (hybrids)',
        kind: 'factory',
        x: 1770,
        y: 170,
        width: 150,
        height: 95,
      },
      {
        id: 'telltales-bottom',
        name: 'Bottom telltale strip',
        kind: 'factory',
        x: 560,
        y: 652,
        width: 960,
        height: 68,
      },
      ...cornerPolygons(1920),
      {
        id: 'stock-map-window',
        name: 'Stock map window (slot 0x100)',
        kind: 'info',
        x: 416,
        y: 120,
        width: 1088,
        height: 480,
      },
      // The zones below are reported by other cluster projects from their cars and photos
      // (Cluster Layouts' STRIP_Y and M boxes, bimmer-lab issue #5, cruzen991). idv7lol hasn't
      // measured them, so they are drawn as hints and never raise findings.
      {
        id: 'bottom-strip',
        name: "Bottom strip: the car's own (the car app cuts layouts here)",
        kind: 'info',
        x: 0,
        y: 646,
        width: 1920,
        height: 74,
      },
      {
        id: 'm-box-left',
        name: 'M cars: cluster box (approx. ±10 px)',
        kind: 'info',
        x: 793,
        y: 289,
        width: 246,
        height: 92,
      },
      {
        id: 'm-box-right',
        name: 'M cars: cluster box (approx. ±10 px)',
        kind: 'info',
        x: 1223,
        y: 328,
        width: 171,
        height: 78,
      },
      {
        id: 'driver-camera',
        name: 'Driver camera notch (cars with it, to y ≈ 147)',
        kind: 'info',
        x: 740,
        y: 128,
        width: 440,
        height: 19,
      },
    ],
  },
];

export function getDisplayProfile(id: string): DisplayProfile | undefined {
  return DISPLAY_PROFILES.find((p) => p.id === id);
}

export const DEFAULT_DISPLAY_PROFILE_ID = 'kombi-id7-12.3';
