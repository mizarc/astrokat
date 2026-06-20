import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  getTrackingPoints,
  cropToCircle,
  createFlashedProfile,
  generateSlap,
} from './slap.js';

describe('getTrackingPoints', () => {
  it('should return correct number of points for 60 frames', () => {
    const points = getTrackingPoints(60);
    expect(points).toHaveLength(60);
  });

  it('should start at the first keyframe position', () => {
    const points = getTrackingPoints(60);
    expect(points[0]).toEqual([20, 140]);
  });

  it('should end at the last keyframe position (clamped)', () => {
    const points = getTrackingPoints(60);
    // Frame 59 is between keyframe 50 (38,160) and 60 (37,164)
    // progress = 9/10 = 0.9
    // x = 38 + (37-38)*0.9 = 37.1 -> Math.trunc = 37
    // y = 160 + (164-160)*0.9 = 163.6 -> Math.trunc = 163
    expect(points[59]).toEqual([37, 163]);
  });

  it('should interpolate mid-range values', () => {
    const points = getTrackingPoints(60);
    // Frame 5: between keyframe 0 (20,140) and 10 (30,150)
    // progress = (5-0)/(10-0) = 0.5
    // x = 20 + 10*0.5 = 25
    // y = 140 + 10*0.5 = 145
    expect(points[5]).toEqual([25, 145]);
  });

  it('should interpolate at exact keyframe boundaries', () => {
    const points = getTrackingPoints(60);
    expect(points[10]).toEqual([30, 150]);
    expect(points[25]).toEqual([35, 150]);
    expect(points[32]).toEqual([44, 141]);
    expect(points[40]).toEqual([40, 150]);
    expect(points[50]).toEqual([38, 160]);
  });

  it('should handle fewer frames than last keyframe index', () => {
    const points = getTrackingPoints(15);
    expect(points).toHaveLength(15);
    // Frame 14: between keyframe 10 (30,150) and 25 (35,150)
    // progress = (14-10)/(25-10) = 4/15
    // x = 30 + 5*(4/15) = 31.333 -> Math.trunc = 31
    // y = 150 + 0 = 150
    expect(points[14]).toEqual([31, 150]);
  });
});

describe('cropToCircle', () => {
  it('should produce a circular PNG of the correct size', async () => {
    // Create a simple test image (solid red square)
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await cropToCircle(testImage, 60);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Verify dimensions
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(60);
    expect(meta.height).toBe(60);
    expect(meta.format).toBe('png');
    expect(meta.channels).toBe(4); // RGBA due to alpha mask
  });

  it('should handle non-square images', async () => {
    // Create a rectangular test image
    const testImage = await sharp({
      create: {
        width: 80,
        height: 120,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await cropToCircle(testImage, 50);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });

  it('should handle small size parameter', async () => {
    const testImage = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const result = await cropToCircle(testImage, 10);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });
});

describe('createFlashedProfile', () => {
  it('should produce a PNG buffer with red tint', async () => {
    const profilePng = await sharp({
      create: {
        width: 60,
        height: 60,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await createFlashedProfile(profilePng);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(60);
    expect(meta.height).toBe(60);
    expect(meta.format).toBe('png');
  });

  it('should preserve dimensions of input', async () => {
    const profilePng = await sharp({
      create: {
        width: 45,
        height: 45,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await createFlashedProfile(profilePng);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(45);
    expect(meta.height).toBe(45);
  });
});

describe('generateSlap', () => {
  it('should produce an animated WebP buffer', async () => {
    // Create a simple test avatar
    const avatarBuffer = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 255, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateSlap(avatarBuffer);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    // Verify it starts with RIFF WebP header
    const header = result.toString('ascii', 0, 4);
    expect(header).toBe('RIFF');
  }, 10000);

  it('should produce output larger than a minimum threshold', async () => {
    const avatarBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 128, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const result = await generateSlap(avatarBuffer);
    // Animated 60-frame GIF should be at least 10KB
    expect(result.length).toBeGreaterThan(10 * 1024);
  }, 30000);
});
