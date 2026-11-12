import type { Canvas2DLike } from '../canvas.js';

/**
 * Simple vector telltale icons drawn in a 100×100 box (origin top-left).
 * They are deliberately plain: idv7lol never replaces the factory telltales,
 * these only mirror a signal inside a custom layout.
 */
export type IconName =
  | 'turn-left'
  | 'turn-right'
  | 'high-beam'
  | 'low-beam'
  | 'fog-rear'
  | 'parking-brake'
  | 'cruise'
  | 'battery'
  | 'fuel'
  | 'engine'
  | 'oil'
  | 'coolant'
  | 'snowflake';

function arrow(ctx: Canvas2DLike, dir: 1 | -1): void {
  ctx.beginPath();
  // dir 1 points right, -1 points left
  const pts: Array<[number, number]> = [
    [50 + 45 * dir, 50],
    [50 + 0 * dir, 10],
    [50 + 0 * dir, 35],
    [50 - 45 * dir, 35],
    [50 - 45 * dir, 65],
    [50 + 0 * dir, 65],
    [50 + 0 * dir, 90],
  ];
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function beam(ctx: Canvas2DLike, high: boolean): void {
  // Headlamp body: a D shape on the right
  ctx.beginPath();
  ctx.moveTo(55, 20);
  ctx.arc(55, 50, 30, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(55, 80);
  ctx.closePath();
  ctx.lineWidth = 7;
  ctx.stroke();
  // Rays
  ctx.lineWidth = 6;
  for (let i = 0; i < 4; i++) {
    const y = 26 + i * 16;
    ctx.beginPath();
    ctx.moveTo(44, y);
    ctx.lineTo(10, high ? y : y + 8);
    ctx.stroke();
  }
}

export function drawIcon(ctx: Canvas2DLike, name: IconName): void {
  switch (name) {
    case 'turn-left':
      arrow(ctx, -1);
      return;
    case 'turn-right':
      arrow(ctx, 1);
      return;
    case 'high-beam':
      beam(ctx, true);
      return;
    case 'low-beam':
      beam(ctx, false);
      return;
    case 'fog-rear':
      beam(ctx, false);
      ctx.beginPath();
      ctx.moveTo(22, 15);
      ctx.lineTo(28, 85);
      ctx.lineWidth = 5;
      ctx.stroke();
      return;
    case 'parking-brake':
      ctx.beginPath();
      ctx.arc(50, 50, 36, 0, Math.PI * 2);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(50, 50, 46, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(50, 50, 46, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', 50, 52);
      return;
    case 'cruise':
      ctx.beginPath();
      ctx.arc(50, 55, 36, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(50, 55);
      ctx.lineTo(72, 35);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(22, 90);
      ctx.lineTo(78, 90);
      ctx.stroke();
      return;
    case 'battery':
      ctx.beginPath();
      ctx.rect(12, 30, 76, 50);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillRect(22, 20, 16, 10);
      ctx.fillRect(62, 20, 16, 10);
      ctx.fillRect(22, 52, 18, 6);
      ctx.fillRect(60, 52, 18, 6);
      ctx.fillRect(66, 46, 6, 18);
      return;
    case 'fuel':
      ctx.beginPath();
      ctx.rect(15, 20, 45, 70);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillRect(22, 28, 31, 22);
      ctx.beginPath();
      ctx.moveTo(60, 40);
      ctx.lineTo(75, 40);
      ctx.lineTo(82, 50);
      ctx.lineTo(82, 78);
      ctx.arc(76, 78, 6, 0, Math.PI);
      ctx.lineTo(70, 50);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillRect(10, 86, 55, 8);
      return;
    case 'engine':
      ctx.beginPath();
      ctx.moveTo(30, 30);
      ctx.lineTo(45, 30);
      ctx.lineTo(45, 22);
      ctx.lineTo(60, 22);
      ctx.lineTo(60, 30);
      ctx.lineTo(72, 30);
      ctx.lineTo(80, 42);
      ctx.lineTo(90, 42);
      ctx.lineTo(90, 70);
      ctx.lineTo(80, 70);
      ctx.lineTo(72, 80);
      ctx.lineTo(40, 80);
      ctx.lineTo(30, 70);
      ctx.lineTo(22, 70);
      ctx.lineTo(22, 50);
      ctx.lineTo(10, 50);
      ctx.lineTo(10, 40);
      ctx.lineTo(22, 40);
      ctx.closePath();
      ctx.fill();
      return;
    case 'oil':
      ctx.beginPath();
      ctx.moveTo(20, 45);
      ctx.lineTo(70, 45);
      ctx.lineTo(85, 60);
      ctx.lineTo(92, 50);
      ctx.lineTo(92, 56);
      ctx.lineTo(82, 72);
      ctx.lineTo(20, 72);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(40, 32, 10, 13);
      ctx.fillRect(30, 28, 30, 6);
      ctx.beginPath();
      ctx.arc(10, 66, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'coolant':
      ctx.beginPath();
      ctx.rect(42, 15, 16, 50);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(50, 70, 12, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(10, 86 + i * 8);
        for (let x = 10; x <= 90; x += 10) ctx.lineTo(x, 86 + i * 8 + (x % 20 === 0 ? -4 : 4));
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      return;
    case 'snowflake':
      ctx.lineWidth = 7;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(50 - Math.cos(a) * 40, 50 - Math.sin(a) * 40);
        ctx.lineTo(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40);
        ctx.stroke();
      }
      return;
  }
}
