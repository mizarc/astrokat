import type { BotCommand } from '../../types.js';
import sharp from 'sharp';
import GIFEncoder from 'gif-encoder';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = resolve(
  __dirname, '..', '..', '..', '..', 'assets', 'slap.webp',
);

const PROFILE_SIZE = 60;
const FLASH_FRAMES = new Set([7, 12, 17, 22, 27, 32, 35, 40, 46]);

export const SlapCommand: BotCommand = {
  name: 'slap',
  description: 'Slaps a user with their profile picture!',
  category: 'social',
  async execute(message, args) {
    // Determine target user
    let targetAvatarUrl: string | undefined;
    let targetUsername: string;

    if (args.length > 0 && message.fetchUser) {
      const cleaned = args[0]!.replace(/[<@!>]/g, '');
      const user = await message.fetchUser(cleaned);
      if (user) {
        targetAvatarUrl = user.avatarUrl;
        targetUsername = user.username;
      } else {
        await message.reply('❌ Could not find that user.');
        return;
      }
    } else {
      targetAvatarUrl = message.avatarUrl;
      targetUsername = message.username;
    }

    if (!targetAvatarUrl) {
      await message.reply('❌ Could not retrieve avatar.');
      return;
    }

    try {
      // Download profile image
      const res = await fetch(targetAvatarUrl);
      const avatarBuffer = Buffer.from(await res.arrayBuffer());

      // Generate the slap animation
      const slapBuffer = await generateSlap(avatarBuffer);

      await message.reply({
        content: `**${message.username}** slapped **${targetUsername}**!`,
        files: [{ name: 'slap.webp', data: slapBuffer }],
      });
    } catch {
      await message.reply('❌ Failed to generate slap animation.');
    }
  },
};

/**
 * Main slap animation generator.
 * Crops avatar to circle, composites onto template frames,
 * and encodes as an animated WebP.
 */
export async function generateSlap(
  avatarBuffer: Buffer,
): Promise<Buffer> {
  // Read template WebP metadata for dimensions and frame count
  const meta = await sharp(TEMPLATE_PATH).metadata();
  const gifWidth = meta.width ?? 80;
  const gifHeight = meta.height ?? 200;
  const numFrames = meta.pages ?? 30;
  const delays = (meta.delay as number[] | undefined)?.slice(0, numFrames)
    ?? new Array(numFrames).fill(100);

  // Crop avatar to circle and resize
  const profilePng = await cropToCircle(avatarBuffer, PROFILE_SIZE);

  // Create red-flashed version of profile pic
  const flashedPng = await createFlashedProfile(profilePng);

  // Create squashed version for slap-impact frames
  const squashedFlashingPng = await squashProfile(flashedPng);
  const squashMeta = await sharp(squashedFlashingPng).metadata();
  const squashW = squashMeta.width!;
  const squashH = squashMeta.height!;

  // Compute tracking points via keyframe interpolation
  const trackingPoints = getTrackingPoints(numFrames);

  // Assemble frames into an intermediate GIF using gif-encoder
  const encoder = new GIFEncoder(gifWidth, gifHeight, {
    highWaterMark: 1024 * 1024 * 50,
  });

  const chunks: Buffer[] = [];
  encoder.on('data', (chunk: Buffer) => chunks.push(chunk));

  encoder.setRepeat(0);
  encoder.setDelay(delays[0]!);
  encoder.setQuality(1);
  encoder.writeHeader();

  for (let i = 0; i < numFrames; i++) {
    const framePng = await sharp(TEMPLATE_PATH, { page: i }).png().toBuffer();
    const [tx, ty] = trackingPoints[i]!;

    // Use squashed+flashed profile on impact frames, normal circle otherwise
    const isFlash = FLASH_FRAMES.has(i);
    const activeProfile = isFlash ? squashedFlashingPng : profilePng;
    const pw = isFlash ? squashW : PROFILE_SIZE;
    const ph = isFlash ? squashH : PROFILE_SIZE;

    const composited = await sharp(framePng)
      .composite([{
        input: activeProfile,
        top: Math.round(ty - ph / 2),
        left: Math.round(tx - pw / 2),
      }])
      .ensureAlpha()
      .raw()
      .toBuffer();

    encoder.addFrame(composited);
  }

  encoder.finish();

  // Convert to animated WebP with quality compression
  return await sharp(Buffer.concat(chunks), { animated: true })
    .webp({ quality: 80, effort: 6, loop: 0, delay: delays })
    .toBuffer();
}

/**
 * Crops an image to a circle and resizes to the specified size.
 */
export async function cropToCircle(
  buffer: Buffer,
  size: number,
): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
  </svg>`;

  return await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{
      input: Buffer.from(svg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();
}

/**
 * Creates a squashed version of the profile picture for slap-impact flash frames.
 * Compresses horizontally and slightly vertically to show the face getting smacked.
 */
export async function squashProfile(
  profilePng: Buffer,
): Promise<Buffer> {
  const { width, height } = await sharp(profilePng).metadata();
  const size = width!;

  const squashW = Math.round(size * 0.90);
  const squashH = Math.round(size * 0.95);

  const ellipseSvg = `<svg width="${squashW}" height="${squashH}">
    <ellipse cx="${squashW / 2}" cy="${squashH / 2}" rx="${squashW / 2}" ry="${squashH / 2}" fill="white"/>
  </svg>`;

  return await sharp(profilePng)
    .resize(squashW, squashH, { fit: 'fill' })
    .composite([{
      input: Buffer.from(ellipseSvg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();
}

/**
 * Creates a red-tinted version of the profile picture for flash frames.
 */
export async function createFlashedProfile(
  profilePng: Buffer,
): Promise<Buffer> {
  const { width, height } = await sharp(profilePng)
    .metadata();

  const size = width!;
  const circleSvg = `<svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
  </svg>`;

  const redOverlay = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.35 },
    },
  })
    .composite([{
      input: Buffer.from(circleSvg),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  return await sharp(profilePng)
    .composite([{ input: redOverlay, blend: 'over' }])
    .png()
    .toBuffer();
}

/**
 * Computes tracking points for the face overlay position
 * using linear interpolation between keyframes.
 */
export function getTrackingPoints(
  numFrames: number,
): Array<[number, number]> {
  const keyframes: Array<[number, number, number]> = [
    [0, 20, 140],
    [10, 30, 150],
    [25, 35, 150],
    [32, 44, 141],
    [40, 40, 150],
    [50, 38, 160],
    [60, 37, 164],
  ];

  const points: Array<[number, number]> = [];

  for (let i = 0; i < numFrames; i++) {
    const startKf = [...keyframes].reverse()
      .find((kf) => kf[0] <= i)!;
    const endKf = keyframes.find((kf) => kf[0] >= i)!;

    if (startKf[0] === endKf[0]) {
      points.push([startKf[1], startKf[2]]);
      continue;
    }

    const segmentLen = endKf[0] - startKf[0];
    const progress = segmentLen > 0
      ? (i - startKf[0]) / segmentLen
      : 0;

    const x = Math.trunc(
      startKf[1] + (endKf[1] - startKf[1]) * progress,
    );
    const y = Math.trunc(
      startKf[2] + (endKf[2] - startKf[2]) * progress,
    );

    points.push([x, y]);
  }

  return points;
}
