import { t } from '../../../../i18n.js';
import { guildFeatureService } from '../../../../services/guildconfig/guildFeatureService.js';

/**
 * Handle `!settings features` to toggle data-storing features.
 */
export async function handleFeatures(message: any, guildId: string, args: string[]): Promise<void> {
  const listOnly = !args[0] || args[0] === 'list';

  if (listOnly) {
    await listFeatures(message, guildId);
    return;
  }

  // settings features enable|disable <name>
  const action = args[0]?.toLowerCase();
  const featureName = args[1]?.toLowerCase();

  if (!action || (action !== 'enable' && action !== 'disable') || !featureName) {
    await message.reply(t('commands.settings.features.usage'));
    return;
  }

  const isEnabled = action === 'enable';

  switch (featureName) {
    case 'xp': {
      await guildFeatureService.set(guildId, 'xp', isEnabled);
      const key = isEnabled
        ? 'commands.settings.features.xpEnabled'
        : 'commands.settings.features.xpDisabled';
      await message.reply(t(key));
      break;
    }
    case 'rep': {
      await guildFeatureService.set(guildId, 'rep', isEnabled);
      const key = isEnabled
        ? 'commands.settings.features.repEnabled'
        : 'commands.settings.features.repDisabled';
      await message.reply(t(key));
      break;
    }
    default:
      await message.reply(t('commands.settings.features.unknown', { feature: featureName }));
  }
}

async function listFeatures(message: any, guildId: string): Promise<void> {
  const features = await guildFeatureService.getAll(guildId);

  const xpStatus =
    features.xp !== false
      ? t('commands.settings.features.statusEnabled')
      : t('commands.settings.features.statusDisabled');

  const repStatus =
    features.rep !== false
      ? t('commands.settings.features.statusEnabled')
      : t('commands.settings.features.statusDisabled');

  const embed = {
    title: t('commands.settings.features.title'),
    description: [`**XP:** ${xpStatus}`, `**Rep:** ${repStatus}`].join('\n'),
    color: 0x5865f2,
    footer: { text: t('commands.settings.features.footer') },
  };

  await message.reply({ content: '', embeds: [embed] });
}
