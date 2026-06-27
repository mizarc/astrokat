import type { GuildSnapshot } from './guildSnapshotStore.js';

/**
 * Generates an SVG line chart of guild count over time.
 * Returns the SVG as a string, ready to be rendered via sharp.
 *
 * @param data  Snapshots in chronological order (oldest first).
 * @param width  Image width in pixels.
 * @param height Image height in pixels.
 */
export function generateGuildChart(data: GuildSnapshot[], width = 600, height = 300): string {
  if (data.length < 2) return '';

  const pad = { top: 24, right: 20, bottom: 44, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = data.map((d) => d.guildCount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Grid lines (5 evenly spaced horizontal lines)
  const gridLines = 5;
  let gridSvg = '';
  for (let i = 0; i < gridLines; i++) {
    const y = pad.top + (plotH / (gridLines - 1)) * i;
    const val = Math.round(max - (range / (gridLines - 1)) * i);
    gridSvg += `
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"
            stroke="#2a2a2a" stroke-width="1"/>
      <text x="${pad.left - 8}" y="${y + 4}" fill="#888" font-size="11"
            text-anchor="end">${val}</text>`;
  }

  // Data line
  const points = data.map((d, i) => {
    const x = pad.left + (plotW / (data.length - 1)) * i;
    const y = pad.top + plotH - ((d.guildCount - min) / range) * plotH;
    return `${x},${y}`;
  });

  // Area fill below the line
  const areaPoints = [
    `${pad.left},${pad.top + plotH}`,
    ...points,
    `${pad.left + plotW},${pad.top + plotH}`,
  ];

  // X-axis labels (show first, middle, last)
  const dateLabels: string[] = [];
  const labelIndices = [0];
  if (data.length > 2) labelIndices.push(Math.floor(data.length / 2));
  if (data.length > 1) labelIndices.push(data.length - 1);

  for (const idx of labelIndices) {
    const d = new Date(data[idx]!.recordedAt * 1000);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const x = pad.left + (plotW / (data.length - 1)) * idx;
    dateLabels.push(`
      <text x="${x}" y="${height - 8}" fill="#888" font-size="10"
            text-anchor="${idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}">
        ${label}
      </text>`);
  }

  // Latest value label at the end of the line
  const lastVal = values[values.length - 1]!;
  const lastX = pad.left + plotW;
  const lastY = pad.top + plotH - ((lastVal - min) / range) * plotH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#1e1e1e" rx="8"/>
    <text x="${width / 2}" y="16" fill="#ccc" font-size="13" font-weight="600"
          text-anchor="middle">Guild Count</text>
    ${gridSvg}
    <polygon points="${areaPoints.join(' ')}" fill="rgba(88,101,242,0.15)"/>
    <polyline points="${points.join(' ')}" fill="none" stroke="#5865f2"
              stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="4" fill="#5865f2"/>
    <text x="${lastX + 8}" y="${lastY + 4}" fill="#fff" font-size="12"
          font-weight="600">${lastVal}</text>
    ${dateLabels.join('')}
  </svg>`;
}
