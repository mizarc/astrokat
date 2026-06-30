import type { GuildSnapshot } from './guildSnapshotStore.js';

interface ChartConfig {
  /** Label shown at the top of the chart. */
  title: string;
  /** Extracts the Y value from a snapshot. */
  value: (d: GuildSnapshot) => number;
  /** CSS color for the line / area / dot. */
  color: string;
}

/**
 * Generates an SVG line chart for a single metric.
 * Returns the SVG as a string.
 *
 * @param data   Snapshots in chronological order (oldest first).
 * @param cfg    Chart configuration (title, value extractor, color).
 * @param width  Image width in pixels.
 * @param height Image height in pixels.
 */
function generateChart(data: GuildSnapshot[], cfg: ChartConfig, width = 600, height = 220): string {
  if (data.length < 2) return '';

  const pad = { top: 26, right: 28, bottom: 44, left: 64 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = data.map(cfg.value);
  let min = Math.min(...values);
  let max = Math.max(...values);

  // When all values are identical, pad the Y range so the line
  // sits centered with sensible grid labels instead of duplicates.
  if (min === max) {
    if (min === 0) {
      max = 4;
    } else {
      max = min + 2;
      min = Math.max(0, min - 2);
    }
  }

  const range = max - min;

  // Grid lines
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
    const y = pad.top + plotH - ((cfg.value(d) - min) / range) * plotH;
    return `${x},${y}`;
  });

  // Area fill
  const areaPoints = [
    `${pad.left},${pad.top + plotH}`,
    ...points,
    `${pad.left + plotW},${pad.top + plotH}`,
  ];

  // X-axis labels
  const labelIndices = [0];
  if (data.length > 2) labelIndices.push(Math.floor(data.length / 2));
  if (data.length > 1) labelIndices.push(data.length - 1);

  let dateSvg = '';
  for (const idx of labelIndices) {
    const d = new Date(data[idx]!.recordedAt * 1000);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const x = pad.left + (plotW / (data.length - 1)) * idx;
    dateSvg += `
      <text x="${x}" y="${pad.top + plotH + 14}" fill="#888" font-size="10"
            text-anchor="${idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}">
        ${label}
      </text>`;
  }

  // End-of-line dot + label
  const lastVal = values[values.length - 1]!;
  const lastX = pad.left + plotW;
  const lastY = pad.top + plotH - ((lastVal - min) / range) * plotH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text { font-family: 'Noto Sans', 'DejaVu Sans', sans-serif; }</style>
    <rect width="${width}" height="${height}" fill="#1e1e1e" rx="6"/>
    <text x="${width / 2}" y="10" fill="#ccc" font-size="12" font-weight="600"
          text-anchor="middle">${cfg.title}</text>
    ${gridSvg}
    <polygon points="${areaPoints.join(' ')}" fill="${cfg.color}26"/>
    <polyline points="${points.join(' ')}" fill="none" stroke="${cfg.color}"
              stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="${cfg.color}"/>
    <text x="${lastX + 7}" y="${lastY + 4}" fill="#fff" font-size="11"
          font-weight="600">${formatNum(lastVal)}</text>
    ${dateSvg}
  </svg>`;
}

function formatNum(n: number): string {
  return n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + 'M'
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + 'k'
      : String(n);
}

/**
 * Generates a combined SVG with guild count and member count charts
 * stacked vertically. Returns a single SVG ready for sharp rendering.
 */
export function generateCombinedChart(data: GuildSnapshot[]): string {
  const width = 600;
  const chartH = 200;
  const gap = 16;
  const topPad = 24;
  const rightPad = 8;
  const bottomPad = 14;
  const totalW = width + rightPad;
  const totalH = chartH * 2 + gap + topPad + bottomPad;

  if (data.length < 2) return '';

  const guildSvg = generateChart(
    data,
    {
      title: 'Guild Count',
      value: (d) => d.guildCount,
      color: '#5865f2',
    },
    width,
    chartH
  );

  const memberSvg = generateChart(
    data,
    {
      title: 'Member Count',
      value: (d) => d.memberTotal,
      color: '#57f287',
    },
    width,
    chartH
  );

  // Extract the inner content of each SVG (everything inside <svg>…</svg>)
  // so we can nest them in a single combined wrapper.
  const guildBody = guildSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');
  const memberBody = memberSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
    <rect width="${totalW}" height="${totalH}" fill="#1e1e1e" rx="8"/>
    <g transform="translate(0, ${topPad})">${guildBody}</g>
    <g transform="translate(0, ${topPad + chartH + gap})">${memberBody}</g>
  </svg>`;
}
