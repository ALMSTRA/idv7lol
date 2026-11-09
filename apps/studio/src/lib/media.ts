import type { AssetAnimation } from '@idv7lol/theme-schema';

/**
 * Animated files become a sprite sheet: one PNG with every frame in a grid.
 * That is what the Studio plays and what the compiler sends to the car, where
 * the renderer flips frames by itself with no traffic per frame.
 */
const MAX_FRAMES = 120;
const MAX_VIDEO_SECONDS = 12;
const MAX_VIDEO_FPS = 15;
const MAX_FRAME_SIDE = 640;
/** Sheet size limit; the car's atlas holds about 1.4 megapixels anyway. */
const MAX_SHEET_PIXELS = 4_000_000;

export interface DecodedAnimation {
  frames: CanvasImageSource[];
  durations: number[];
  width: number;
  height: number;
  /** The original was longer than what was kept. */
  trimmed: boolean;
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { animated: boolean; frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
type ImageDecoderClass = (new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike) & {
  isTypeSupported(type: string): Promise<boolean>;
};

const canvasOf = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const yieldToUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Decode GIF, animated WebP or APNG frames. Null when the file is a still image. */
async function decodeAnimatedImage(
  file: File,
  progress: (p: number) => void,
): Promise<DecodedAnimation | null> {
  const Decoder = (window as unknown as { ImageDecoder?: ImageDecoderClass }).ImageDecoder;
  if (!Decoder || !(await Decoder.isTypeSupported(file.type).catch(() => false))) return null;
  const decoder = new Decoder({ data: await file.arrayBuffer(), type: file.type });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated || track.frameCount < 2) return null;
    const total = track.frameCount;
    const step = Math.max(1, total / MAX_FRAMES);
    const frames: CanvasImageSource[] = [];
    const durations: number[] = [];
    let width = 0;
    let height = 0;
    let next = 0;
    for (let i = 0; i < total; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const ms = Math.max(20, (image.duration ?? 100_000) / 1000);
      if (i >= Math.floor(next)) {
        width = image.displayWidth;
        height = image.displayHeight;
        const c = canvasOf(width, height);
        c.getContext('2d')!.drawImage(image, 0, 0);
        frames.push(c);
        durations.push(ms);
        next += step;
      } else {
        durations[durations.length - 1]! += ms;
      }
      image.close();
      progress((i + 1) / total);
      if (i % 4 === 0) await yieldToUi();
    }
    return { frames, durations: durations.map(Math.round), width, height, trimmed: false };
  } finally {
    decoder.close();
  }
}

/** Sample a video into frames by seeking. Audio is ignored. */
async function decodeVideo(file: File, progress: (p: number) => void): Promise<DecodedAnimation> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('This video format cannot be read here'));
    });
    const seconds = Math.min(video.duration, MAX_VIDEO_SECONDS);
    const fps = Math.min(MAX_VIDEO_FPS, MAX_FRAMES / seconds);
    const count = Math.max(2, Math.floor(seconds * fps));
    const frames: CanvasImageSource[] = [];
    const ms = Math.round(1000 / fps);
    for (let i = 0; i < count; i++) {
      video.currentTime = i / fps;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      const c = canvasOf(video.videoWidth, video.videoHeight);
      c.getContext('2d')!.drawImage(video, 0, 0);
      frames.push(c);
      progress((i + 1) / count);
      if (i % 2 === 0) await yieldToUi();
    }
    return {
      frames,
      durations: frames.map(() => ms),
      width: video.videoWidth,
      height: video.videoHeight,
      trimmed: video.duration > MAX_VIDEO_SECONDS,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Frames of an animated file or video; null for still images. */
export function decodeAnimated(
  file: File,
  progress: (p: number) => void,
): Promise<DecodedAnimation | null> {
  return file.type.startsWith('video/')
    ? decodeVideo(file, progress)
    : decodeAnimatedImage(file, progress);
}

/** Lay the frames out in one sheet, scaled to the size limits. */
export function buildSheet(a: DecodedAnimation): {
  canvas: HTMLCanvasElement;
  animation: AssetAnimation;
} {
  const n = a.frames.length;
  const fit = Math.min(
    1,
    MAX_FRAME_SIDE / Math.max(a.width, a.height),
    Math.sqrt(MAX_SHEET_PIXELS / (n * a.width * a.height)),
  );
  const frameWidth = Math.max(2, Math.round(a.width * fit));
  const frameHeight = Math.max(2, Math.round(a.height * fit));
  const columns = Math.max(1, Math.ceil(Math.sqrt((n * frameHeight) / frameWidth)));
  const canvas = canvasOf(columns * frameWidth, Math.ceil(n / columns) * frameHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  a.frames.forEach((f, i) => {
    ctx.drawImage(
      f,
      (i % columns) * frameWidth,
      Math.floor(i / columns) * frameHeight,
      frameWidth,
      frameHeight,
    );
  });
  return {
    canvas,
    animation: { frames: n, columns, frameWidth, frameHeight, durations: a.durations },
  };
}
