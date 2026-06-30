import { t } from '../../../../i18n.js';
import type { UnifiedMessage, ReplyEmbed } from '../../../../types.js';
import { getSnapshotStore } from '../../../../services/guildsnapshot/guildSnapshotStore.js';
import { generateGuildChart } from '../../../../services/guildsnapshot/chart.js';
import sharp from 'sharp';

function isOwner(message: { author: { id: string } }): boolean {
  const ownerIds = (process.env.BOT_OPERATOR_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerIds.includes(message.author.id);
}

export async function handleStats(message: UnifiedMessage, _args: string[]) {
  if (!isOwner(message)) {
    await message.reply(t('commands.system.stats.notOwner'));
    return;
  }

  await message.deferReply?.();

  try {
    const store = await getSnapshotStore();
    const platform = message.platform;
    const history = await store.getHistory(50, platform);

    if (history.length === 0) {
      await message.reply(t('commands.system.stats.noData'));
      return;
    }

    // History is newest-first; reverse for chronological order
    const chronological = [...history].reverse();
    const latest = history[0]!;
    const oldest = chronological[0]!;

    // Calculate growth
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const monthAgo = Math.floor(Date.now() / 1000) - 30 * 86400;

    const weekAgoSnapshot =
      history.find((s) => s.recordedAt <= weekAgo) ?? history[history.length - 1]!;

    const monthAgoSnapshot =
      history.find((s) => s.recordedAt <= monthAgo) ?? history[history.length - 1]!;

    const guildGrowth7d = latest.guildCount - weekAgoSnapshot.guildCount;
    const guildGrowth30d = latest.guildCount - monthAgoSnapshot.guildCount;
    const memberGrowth7d = latest.memberTotal - weekAgoSnapshot.memberTotal;
    const memberGrowth30d = latest.memberTotal - monthAgoSnapshot.memberTotal;

    const formatGrowth = (val: number): string => (val >= 0 ? `+${val}` : `${val}`);

    const platformLabel = platform === 'discord' ? 'Discord' : 'Fluxer';
    const firstDate = new Date(oldest.recordedAt * 1000);
    const embed: ReplyEmbed = {
      title: '📊 Guild Statistics',
      color: 0x5865f2,
      fields: [
        {
          name: 'Current',
          value: [
            `**${latest.guildCount}** guilds`,
            `**${latest.memberTotal.toLocaleString()}** members`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Growth (7 days)',
          value: [
            `**${formatGrowth(guildGrowth7d)}** guilds`,
            `**${formatGrowth(memberGrowth7d)}** members`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Growth (30 days)',
          value: [
            `**${formatGrowth(guildGrowth30d)}** guilds`,
            `**${formatGrowth(memberGrowth30d)}** members`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Tracking',
          value: [
            `**${history.length}** snapshots recorded`,
            `Since ${firstDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}`,
          ].join('\n'),
          inline: false,
        },
      ],
    };

    // Generate chart image if we have enough data
    if (chronological.length >= 2) {
      const svg = generateGuildChart(chronological);
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

      await message.reply({
        content: '',
        embeds: [embed],
        files: [{ name: 'guild-stats.png', data: pngBuffer }],
      });
    } else {
      await message.reply({ content: '', embeds: [embed] });
    }
  } catch (error) {
    console.error('[STATS] Error:', error);
    await message.reply(t('commands.system.stats.error'));
  }
}
