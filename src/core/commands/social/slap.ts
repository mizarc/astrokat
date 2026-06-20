import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = resolve(__dirname, '..', '..', '..', '..', 'assets', 'slap.webp');

/** Size in pixels for the circular profile crop. */
const PROFILE_SIZE = 60;

/** Frame indices where the profile picture gets a "smack" effect */
const FLASH_FRAMES = new Set([7, 12, 17, 22, 27, 32, 35, 40, 46]);

export const SlapCommand: BotCommand = {
  name: 'slap',
  description: 'Slaps a user with their profile picture!',
  category: 'social',
  parameters: [{ name: 'user', description: 'The user to slap', type: 'user', required: false }],
  async execute(message, args) {
    // Defer the reply to prevent Discord's 3-second interaction timeout
    await message.deferReply?.();

    // Resolve target user
    let targetAvatarUrl: string | undefined;
    let targetUsername: string;

    if (args.length > 0 && message.fetchUser) {
      const cleaned = args[0]!.replace(/[<@!>]/g, '');
      const user = await message.fetchUser(cleaned);
      if (user) {
        targetAvatarUrl = user.avatarUrl;
        targetUsername = user.username;
      } else {
        await message.reply(t('commands.slap.userNotFound'));
        return;
      }
    } else {
      targetAvatarUrl = message.author.avatarUrl;
      targetUsername = message.author.username;
    }

    if (!targetAvatarUrl) {
      await message.reply(t('commands.slap.avatarNotFound'));
      return;
    }

    try {
      // Download profile image (we only need ~60px, request smaller from CDN)
      const smallUrl = targetAvatarUrl.replace(/size=\d+/, 'size=128');
      const res = await fetch(smallUrl);
      const avatarBuffer = Buffer.from(await res.arrayBuffer());

      // Generate the slap animation
      const slapBuffer = await generateSlap(avatarBuffer);

      // Upload attachment in a reply
      await message.reply({
        content: t('commands.slap.result', {
          slapper: message.author.username,
          target: targetUsername,
        }),
        files: [{ name: 'slap.webp', data: slapBuffer }],
      });
    } catch {
      await message.reply(t('commands.slap.generationFailed'));
    }
  },
};

/**
 * Main slap animation generator.
 *
 * Three-phase pipeline:
 *   1. Pre-process the avatar into three variants (circular crop,
 *      red-flashed, squashed+flashed) used by different frames.
 *   2. Composite each of the 60 template pages with the appropriate
 *      profile overlay in parallel, outputting raw RGBA buffers.
 *   3. Encode each raw frame as a lossy WebP (via sharp/libwebp),
 *      extract the VP8 bitstream, and assemble into an animated WebP
 *      container.
 *
 * @param avatarBuffer - Raw image buffer of the user's avatar.
 * @returns A complete animated WebP buffer ready for upload.
 */
export async function generateSlap(avatarBuffer: Buffer): Promise<Buffer> {
  // Read template metadata for dimensions and frame count
  const meta = await sharp(TEMPLATE_PATH).metadata();
  const frameW = meta.width ?? 165;
  const frameH = meta.height ?? 294;
  const numFrames = meta.pages ?? 60;
  const delays = (meta.delay as number[] | undefined)?.slice(0, numFrames)
    ?? new Array(numFrames).fill(100);

  // Pre-process profile variants
  const profilePng = await cropToCircle(avatarBuffer, PROFILE_SIZE);
  const flashedPng = await createFlashedProfile(profilePng);
  const squashedFlashingPng = await squashProfile(flashedPng);

  // Compute squash dimensions statically (derived from PROFILE_SIZE)
  const squashW = Math.round(PROFILE_SIZE * 0.9);
  const squashH = Math.round(PROFILE_SIZE * 0.95);

  // Compute tracking points via keyframe interpolation
  const trackingPoints = getTrackingPoints(numFrames);

  // Composite each frame in parallel with the appropriate profile variant.
  // Running all 60 frames concurrently via Promise.all keeps wall-clock
  // time close to the cost of a single frame.
  const rawPages = await Promise.all(
    Array.from({ length: numFrames }, (_, i) => {
      const isFlash = FLASH_FRAMES.has(i);
      const activeProfile = isFlash ? squashedFlashingPng : profilePng;
      const pw = isFlash ? squashW : PROFILE_SIZE;
      const ph = isFlash ? squashH : PROFILE_SIZE;
      const [tx, ty] = trackingPoints[i]!;

      return sharp(TEMPLATE_PATH, { page: i })
        .composite([{
          input: activeProfile,
          top: Math.round(ty - ph / 2),
          left: Math.round(tx - pw / 2),
        }])
        .ensureAlpha()
        .raw()
        .toBuffer();
    })
  );

  // Encode each frame as an individual lossy WebP.
  // Each frame is encoded independently so this step is also fully
  // parallelized.
  const frameWebPs: Buffer[] = await Promise.all(
    rawPages.map((raw) =>
      sharp(raw, { raw: { width: frameW, height: frameH, channels: 4 } })
        .webp({ quality: 80, effort: 2 })
        .toBuffer()
    )
  );

  // Assemble animated WebP container.
  // Extract the VP8 chunk from each single-frame WebP and pack them
  // into a WEBP container with VP8X + ANIM + ANMF chunks.
  const payloads = frameWebPs.map(extractFramePayload);
  return buildAnimatedWebP(frameW, frameH, delays, payloads);
}

/**
 * Extract the VP8 or VP8L bitstream chunk from a single-frame WebP buffer.
 *
 * sharp outputs standard WEBP containers. For animated WebP assembly
 * we need just the raw VP8/VP8L chunk (tag + size + payload) to place
 * inside an ANMF frame-data slot, the same format libwebp/cwebp uses.
 * 
 * @param webp - A single-frame WebP buffer from sharp.
 * @returns The full VP8/VP8L chunk including its 8-byte header.
 */
function extractFramePayload(webp: Buffer): Buffer {
  // Skip the 12-byte RIFF container header
  let off = 12;
  while (off + 8 <= webp.length) {
    const tag = webp.toString('ascii', off, off + 4);
    const size = webp.readUInt32LE(off + 4);
    if (tag === 'VP8 ' || tag === 'VP8L') {
      // Return the full chunk — header (8 bytes) + payload.
      // The ANMF frame data expects this exact format.
      return webp.subarray(off, off + 8 + size);
    }
    // Skip chunk: 8-byte header + payload + optional RIFF padding byte
    off += 8 + size + (size & 1);
  }
  throw new Error('No VP8/VP8L chunk found in sharp WebP output');
}

/**
 * Write a RIFF chunk with word-aligned padding.
 *
 * The RIFF container format requires each chunk's data to start on an
 * even byte boundary. If the data length is odd, a single null padding
 * byte is appended. The chunk's size field stores the original data
 * length WITHOUT the padding byte.
 *
 * @param tag - Four-character chunk identifier (e.g. 'VP8X', 'ANMF').
 * @param data - The chunk payload.
 * @returns A complete RIFF chunk buffer (header + padded data).
 */
function riffChunk(tag: string, data: Buffer): Buffer {
  const hdr = Buffer.alloc(8);
  hdr.write(tag, 0, 'ascii');
  hdr.writeUInt32LE(data.length, 4);
  // RIFF word alignment: append padding byte only when data length is odd
  const padded = data.length % 2 === 1
    ? Buffer.concat([data, Buffer.alloc(1)])
    : data;
  return Buffer.concat([hdr, padded]);
}

/**
 * Assemble an animated WebP container from per-frame VP8/VP8L payloads.
 *
 * The animated WebP format (RIFF/WEBP container) consists of:
 *
 *   RIFF header:
 *     'RIFF' + fileSize + 'WEBP'
 *
 *   Required chunks:
 *     VP8X  — features flags + canvas dimensions (10 bytes)
 *     ANIM  — background color + loop count (6 bytes)
 *
 *   Frame chunks (one per animation frame):
 *     ANMF  — frame position/size + duration + disposal flags + VP8 data
 *
 * @param width  - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param delays - Per-frame durations in milliseconds.
 * @param framePayloads - VP8/VP8L chunks for each frame.
 * @returns A complete animated WebP buffer.
 */
function buildAnimatedWebP(
  width: number,
  height: number,
  delays: number[],
  framePayloads: Buffer[]
): Buffer {
  // VP8X chunk – flags + canvas dimensions
  const vp8xFlags = 0b0001_0010; // bit 4 = animation, bit 1 = alpha
  const vp8xData = Buffer.alloc(10);
  vp8xData.writeUInt8(vp8xFlags, 0);
  vp8xData.writeUIntLE(width - 1, 4, 3);
  vp8xData.writeUIntLE(height - 1, 7, 3);

  // ANIM chunk – background colour (BGRA) + loop count (0 = infinite)
  const animData = Buffer.alloc(6);
  animData.writeUInt8(0, 0);   // B
  animData.writeUInt8(0, 1);   // G
  animData.writeUInt8(0, 2);   // R
  animData.writeUInt8(255, 3); // A
  animData.writeUInt16LE(0, 4); // loop count

  const chunks: Buffer[] = [
    riffChunk('VP8X', vp8xData),
    riffChunk('ANIM', animData),
  ];

  // ── ANMF chunks (one per frame) ─────────────────────────────────
  // Each ANMF has a 16-byte header followed by the VP8/VP8L bitstream.
  //
  // Header layout:
  //   bytes  0-2: frame_x           (3-byte LE)
  //   bytes  3-5: frame_y           (3-byte LE)
  //   bytes  6-8: frame_width - 1   (3-byte LE)
  //   bytes  9-11: frame_height - 1 (3-byte LE)
  //   bytes 12-14: duration (ms)    (3-byte LE)
  //   byte     15: flags
  //                bit 3 = disposal (1 = clear to background)
  //                bit 0 = blending (0 = overwrite, no alpha blend)
  for (let i = 0; i < framePayloads.length; i++) {
    const hdr = Buffer.alloc(16);
    hdr.writeUIntLE(0, 0, 3);                     // frame_x (full canvas)
    hdr.writeUIntLE(0, 3, 3);                     // frame_y
    hdr.writeUIntLE(width - 1, 6, 3);             // frame_width_minus_1
    hdr.writeUIntLE(height - 1, 9, 3);            // frame_height_minus_1
    hdr.writeUIntLE(delays[i] ?? 100, 12, 3);     // duration (ms)
    hdr.writeUInt8(0b0000_1000, 15);              // flags: disposal=1, blending=0

    chunks.push(riffChunk('ANMF', Buffer.concat([hdr, framePayloads[i]!])));
  }

  // RIFF container wrapper
  const payload = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(payload.length + 4, 4); // total = data + 'WEBP' tag
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, payload]);
}

/**
 * Crop an image to a circle and resize to the specified dimensions.
 *
 * Uses an SVG circle mask composited with `dest-in` blend mode
 * (destination-in = keep pixels where the mask is present). The input
 * is resized to fit the circle before masking.
 *
 * @param buffer - Source image buffer (any format sharp supports).
 * @param size - Diameter of the output circle in pixels.
 * @returns A PNG buffer with transparent background and a circular image.
 */
export async function cropToCircle(buffer: Buffer, size: number): Promise<Buffer> {
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
 * Squash the profile picture for slap-impact flash frames.
 *
 * Resizes the 60×60 circular crop to a fixed 54×57 (90% × 95%) using
 * `fill` fit (stretch), then applies an elliptical mask. This creates a
 * squished-face effect that simulates the impact of a slap.
 *
 * @param profilePng - A circular 60×60 PNG from cropToCircle().
 * @returns A PNG buffer with the squashed elliptical profile.
 */
export async function squashProfile(profilePng: Buffer): Promise<Buffer> {
  const squashW = Math.round(PROFILE_SIZE * 0.9);
  const squashH = Math.round(PROFILE_SIZE * 0.95);

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
 * Create a red-tinted version of the profile picture for flash frames.
 *
 * Generates a semi-transparent (35% opacity) red circle overlay that
 * matches the profile dimensions, then composites it on top of the
 * original with `over` blend. The result is a red-flashed avatar
 * used during slap-impact frames to emphasize the hit.
 *
 * @param profilePng - A circular PNG from cropToCircle().
 * @returns A PNG buffer with a red-tinted circular profile.
 */
export async function createFlashedProfile(profilePng: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(profilePng).metadata();
  const size = width!;

  const circleSvg = `<svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
  </svg>`;

  // A 35%-opacity red circle matching the profile shape
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
      blend: 'dest-in',  // Confine the red to the circular mask
    }])
    .png()
    .toBuffer();

  return await sharp(profilePng)
    .composite([{ input: redOverlay, blend: 'over' }])
    .png()
    .toBuffer();
}

/**
 * Compute tracking points for the profile overlay position across frames.
 *
 * For any frame index between keyframes, position is linearly interpolated
 * between the surrounding keyframe coordinates.
 *
 * @param numFrames - Total number of frames in the animation.
 * @returns An array of [x, y] tracking positions, one per frame.
 */
export function getTrackingPoints(numFrames: number): Array<[number, number]> {
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
    const startKf = [...keyframes].reverse().find((kf) => kf[0] <= i)!;
    const endKf = keyframes.find((kf) => kf[0] >= i)!;

    if (startKf[0] === endKf[0]) {
      points.push([startKf[1], startKf[2]]);
      continue;
    }

    const segmentLen = endKf[0] - startKf[0];
    const progress = segmentLen > 0 ? (i - startKf[0]) / segmentLen : 0;

    const x = Math.trunc(startKf[1] + (endKf[1] - startKf[1]) * progress);
    const y = Math.trunc(startKf[2] + (endKf[2] - startKf[2]) * progress);

    points.push([x, y]);
  }

  return points;
}
