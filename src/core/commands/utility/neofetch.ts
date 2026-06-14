import { t } from '../../i18n.js';
import type { BotCommand } from '../../types.js';
import { getCommands } from '../../router.js';
import * as os from 'node:os';

/** Cat ASCII — raw art without padding (padding added programmatically). */
const CAT_LINES = [
  `\\;,. _                           _,,-`,
  `\\\`;, \`-._ _..--''''''--.._ __.-',;(`,
  ` \\ \`;,  \`:.  ,   ;.   .   :'  .;\` /`,
  `  ; \`;;,      .:    :.      ,;;\` /`,
  `   \\ ';/    \\:: :  . ::/    \\;\` ;`,
  `    ).' __.._\`        '_..__ \`./`,
  `    /<  \\\\ /I\`,      ,'I\\ //   >`,
  `    /\\   \`;-7/_\\ -- /_\\7-;'   /\\`,
  `    //.    \`"':" ;; ":\`"'     /\\`,
  `     |/ .  .:' __..__ \`.     \\|`,
  `     /\\|: ./. \`=_  _=' .\\   |/\\`,
  `        /:(/::.  \\/  .::\\) /`,
  `         ////=-v-'\`-v-=\\\\`,
  `         ///\`Nx_\\;;/_xN'\\\\\\`,
  `        / /   \`"w==w"'   \\ \\`,
  `         /                \\`,
];

const CAT_WIDTH = Math.max(...CAT_LINES.map(l => l.length));
const GAP = 3;

/** ANSI color codes for Discord ```ansi blocks. */
const ansi = {
  rst: '\u001b[0m',
  gray: '\u001b[90m',
  cyn: '\u001b[36m',
  pur: '\u001b[35m',
  ylw: '\u001b[33m',
} as const;

export const NeofetchCommand: BotCommand = {
  name: 'neofetch',
  description: 'Shows system and community stats with a cute cat.',
  category: 'utility',
  async execute(message, _args) {
    const guildId = message.guildId;
    if (!guildId) {
      await message.reply(t('commands.neofetch.guildOnly'));
      return;
    }

    // Gather all required system stats for display
    const client = message.client as any;
    const procMem = process.memoryUsage();
    const rssMb = (procMem.rss / 1024 / 1024).toFixed(0);
    const totalSysMem = os.totalmem();
    const freeSysMem = os.freemem();
    const usedSysMemGb = ((totalSysMem - freeSysMem) / 1024 / 1024 / 1024).toFixed(1);
    const totalSysMemGb = (totalSysMem / 1024 / 1024 / 1024).toFixed(1);
    const cpuModel = os.cpus().length > 0 ? os.cpus()[0]!.model.trim() : 'Unknown';
    const cpuCores = os.cpus().length;

    // Gather bot and community stats
    const allCommands = await getCommands();
    let botTag = 'Astrokat';
    let shardId: number | null = null;
    let guildCount = 0;
    let guildDataAvailable = false;

    // Bot tag may be unavailable on some platforms, so default to just the bot name
    try {
      const me = client?.user;
      if (me?.username) {
        const discrim = me.discriminator && me.discriminator !== '0' ? `#${me.discriminator}` : '';
        botTag = `${me.username}${discrim}`;
      }
    } catch { /* user info unavailable */ }

    try {
      // discord.js: client.guilds.cache — Fluxer: client.guilds (Collection directly)
      let guilds: any = client?.guilds?.cache;
      if (!guilds || typeof guilds.size !== 'number') {
        guilds = client?.guilds;
      }
      if (guilds && typeof guilds.size === 'number' && guilds.size > 0) {
        guildDataAvailable = true;
        guildCount = guilds.size;
      }
    } catch { /* guild info unavailable on this platform */ }

    try {
      shardId = client?.ws?.shard?.id ?? null;
    } catch { /* shard info unavailable */ }

    // Version and platform info
    const botVersion = '0.2.0-dev';
    const dbBackend = process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite';
    const header = `${botTag}@astrokat`;

    // Build the info lines with labels and values
    const infoLines: string[] = [
      header,
      `-`.repeat(Math.max(header.length, 20)),
      `OS: AstrokatOS ${process.arch}`,
      `Kernel: ${botVersion}`,
      `Host: ${os.hostname()}`,
      `CPU: ${cpuModel} (${cpuCores})`,
      `Memory: ${usedSysMemGb} GiB / ${totalSysMemGb} GiB`,
      `Process: ${rssMb} MB`,
      `Uptime: ${formatUptime(process.uptime())}`,
      `Node.js: ${process.version}`,
      `Database: ${dbBackend}`,
      `Platform: ${message.platform.charAt(0).toUpperCase() + message.platform.slice(1)}`,
      `Commands: ${allCommands.size}`,
    ];

    // Shard info may be unavailable on some platforms
    if (shardId != null) {
      infoLines.push(`Shard: ${shardId}`);
    }

    // Guild count may be unavailable on some platforms
    if (guildDataAvailable) {
      infoLines.push(`Communities: ${guildCount}`);
    } else {
      infoLines.push('Communities: (unavailable on this platform)');
    }

    // Apply ANSI colors to info lines
    const coloredInfoLines: string[] = [];
    for (const line of infoLines) {
      if (line === header) {
        coloredInfoLines.push(ansi.pur + line + ansi.rst);
      } else if (line.startsWith('-')) {
        coloredInfoLines.push(ansi.gray + line + ansi.rst);
      } else {
        const idx = line.indexOf(':');
        if (idx !== -1) {
          coloredInfoLines.push(ansi.cyn + line.slice(0, idx) + ansi.rst + line.slice(idx));
        } else {
          coloredInfoLines.push(line);
        }
      }
    }

    // Initialise rows with the prompt line, then add the cat + info side by side
    const rows: string[] = [];

    // Prompt line (rendered above the ascii)
    rows.push(ansi.ylw + `${botTag}@astrokat:~$ ` + ansi.rst + 'neofetch');

    // Palette blocks (8 dark + 8 bright)
    const P = (code: string, count = 3) => `${code}${'█'.repeat(count)}${ansi.rst}`;
    const darkPalette = [
      P('\u001b[30m'), P('\u001b[31m'), P('\u001b[32m'), P('\u001b[33m'),
      P('\u001b[34m'), P('\u001b[35m'), P('\u001b[36m'), P('\u001b[37m'),
    ].join('');
    const brightPalette = [
      P('\u001b[90m'), P('\u001b[91m'), P('\u001b[92m'), P('\u001b[93m'),
      P('\u001b[94m'), P('\u001b[95m'), P('\u001b[96m'), P('\u001b[97m'),
    ].join('');

    // Side-by-side: full cat on left, data + palette on right
    const rightSide = [
      ...coloredInfoLines,
      '',
      darkPalette,
      brightPalette,
    ];
    const rowCount = Math.max(CAT_LINES.length, rightSide.length);

    // Build each row by taking the cat line and then the right side line
    for (let i = 0; i < rowCount; i++) {
      const catPart = i < CAT_LINES.length
        ? ansi.pur + CAT_LINES[i]!.padEnd(CAT_WIDTH) + ansi.rst
        : ' '.repeat(CAT_WIDTH);
      const rightPart = i < rightSide.length ? rightSide[i] : '';
      rows.push(catPart + ' '.repeat(GAP) + rightPart);
    }

    await message.reply('```ansi\n' + rows.join('\n') + '\n```');
  },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d > 0 && `${d}d`, h > 0 && `${h}h`, m > 0 && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
