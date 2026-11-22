import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { applyUnits, unitGroups } = require('./units.js') as {
  applyUnits(theme: unknown, groups: string[]): { pieces: Array<{ key: string; tag?: string }> };
  unitGroups(setting: string, car: unknown): string[];
};
const { carUnitsOf } = require('./signals.js') as {
  carUnitsOf(raw: unknown): { speed: string | null; consumption: string | null };
};
const { readPackage } = require('./usb_themes.js') as {
  readPackage(buf: Buffer, o: Record<string, unknown>): { theme: { units?: unknown } };
};

describe('the units a driver sees', () => {
  it('follow the setting, and with Auto the board computer of the car', () => {
    expect(unitGroups('metric', { speed: 'mph', consumption: 'mpg_us' })).toEqual([]);
    expect(unitGroups('mph-celsius', null)).toEqual(['speed']);
    expect(unitGroups('mph-fahrenheit', null)).toEqual(['speed', 'temperature', 'pressure']);
    // Auto: nothing heard from the car, or km/h: as drawn
    expect(unitGroups('auto', null)).toEqual([]);
    expect(unitGroups('auto', { speed: 'kmh', consumption: 'l_100km' })).toEqual([]);
    // mph with UK gallons or litres: miles, the rest as drawn; with US gallons °F and psi too
    expect(unitGroups('auto', { speed: 'mph', consumption: 'mpg_uk' })).toEqual(['speed']);
    expect(unitGroups('auto', { speed: 'mph', consumption: null })).toEqual(['speed']);
    expect(unitGroups('auto', { speed: 'mph', consumption: 'mpg_us' })).toEqual([
      'speed',
      'temperature',
      'pressure',
    ]);
    // a setting this version does not know reads as Auto
    expect(unitGroups('furlongs', { speed: 'mph', consumption: null })).toEqual(['speed']);
  });

  it('are read from the board computer by name or by number', () => {
    expect(
      carUnitsOf({
        statusUnitOfMeasurementSpeedBC: 'MPH__MLS',
        statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_MPG_US',
      }),
    ).toEqual({ speed: 'mph', consumption: 'mpg_us' });
    expect(
      carUnitsOf({ statusUnitOfMeasurementSpeedBC: 1, statusUnitOfMeasurementConsumptionBC: 1 }),
    ).toEqual({ speed: 'kmh', consumption: 'l_100km' });
    expect(carUnitsOf({ statusUnitOfMeasurementSpeedBC: 7 })).toEqual({
      speed: null,
      consumption: null,
    });
    expect(carUnitsOf(undefined)).toEqual({ speed: null, consumption: null });
    expect(carUnitsOf(3)).toEqual({ speed: null, consumption: null });
  });

  it('swap only the pieces of the groups asked for, and leave the theme alone', () => {
    const theme = {
      pieces: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
      units: {
        speed: { a: { key: 'a', tag: 'mph' } },
        temperature: { c: { key: 'c', tag: 'f' } },
      },
    };
    expect(applyUnits(theme, [])).toBe(theme);
    expect(applyUnits(theme, ['pressure'])).toBe(theme);
    const mph = applyUnits(theme, ['speed']);
    expect(mph.pieces.map((p) => p.tag)).toEqual(['mph', undefined, undefined]);
    const us = applyUnits(theme, ['speed', 'temperature', 'pressure']);
    expect(us.pieces.map((p) => p.tag)).toEqual(['mph', undefined, 'f']);
    expect(theme.pieces.map((p) => (p as { tag?: string }).tag)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const bare = { pieces: [] };
    expect(applyUnits(bare, ['speed'])).toBe(bare);
  });
});

describe('the pieces a package brings for other units', () => {
  const piece = (key: string, over: Record<string, unknown> = {}) => ({
    key,
    componentId: key,
    shader: 'rect',
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    statics: {},
    colors: {},
    dynamics: [],
    ...over,
  });
  const pack = (units: unknown) =>
    gzipSync(
      Buffer.from(
        JSON.stringify({
          idv7pkg: 1,
          name: 'T',
          theme: {
            format: 1,
            id: 'units-test',
            target: { renderTarget: 'panel', width: 1920, height: 720 },
            pieces: [piece('a'), piece('b')],
            images: [],
            palettes: { p: { name: 'P', colors: {} } },
            paletteSelection: { default: 'p' },
            fonts: ['sans'],
            units,
          },
          images: {},
        }),
      ),
    );
  const read = (units: unknown) =>
    readPackage(pack(units), {
      appVersion: '9.9.9',
      shaders: { rect: 'void main(){}' },
      fonts: ['sans'],
    }).theme.units;

  it('are kept when each takes the place of a piece of its kind', () => {
    const units = { speed: { a: piece('a', { w: 20 }) }, pressure: { b: piece('b') } };
    expect(read(units)).toEqual(units);
    expect(read(undefined)).toBeUndefined();
  });

  it('are dropped whole when one does not fit, and the theme still installs', () => {
    expect(read({ speed: { z: piece('z') } })).toBeUndefined(); // no such piece
    expect(read({ speed: { a: piece('b') } })).toBeUndefined(); // another key inside
    expect(read({ speed: { a: piece('a', { shader: 'evil' }) } })).toBeUndefined();
    expect(read({ speed: { a: piece('a', { x: 99999 }) } })).toBeUndefined();
    expect(read({ speed: { a: piece('a', { statics: null }) } })).toBeUndefined();
    expect(
      read({ speed: { a: piece('a', { texture: { file: 'images/x.r8' } }) } }),
    ).toBeUndefined();
    // one piece in two groups
    expect(read({ speed: { a: piece('a') }, temperature: { a: piece('a') } })).toBeUndefined();
    expect(read({ speed: [piece('a')] })).toBeUndefined();
    expect(read('mph')).toBeUndefined();
    // a group this version does not know is left out, the rest kept
    expect(read({ speed: { a: piece('a') }, furlongs: { b: piece('b') } })).toEqual({
      speed: { a: piece('a') },
    });
  });
});
