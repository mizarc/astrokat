import { t } from '../../../../i18n.js';
import { guildConfigService } from '../../../../services/guildconfig/guildConfigService.js';
import { xpService } from '../../../../services/xp/xpService.js';
import { repService } from '../../../../services/rep/repService.js';
import { reactionRoleService } from '../../../../services/reactionrole/reactionRoleService.js';
import { joinRoleService } from '../../../../services/joinrole/joinRoleService.js';
import { levelRoleService } from '../../../../services/levelrole/levelRoleService.js';

/**
 * Handle `!settings clear` to clear guild data.
 * Requires Manage Guild permission (checked by caller).
 */
export async function handleClear(message: any, guildId: string, args: string[]): Promise<void> {
  const what = args[0]?.toLowerCase();

  if (!what) {
    await message.reply(t('commands.settings.clear.usage'));
    return;
  }

  switch (what) {
    case 'xp':
      await xpService.clearAllByGuild(guildId);
      await message.reply(t('commands.settings.clear.xpDone'));
      break;

    case 'rep':
      await repService.clearAllByGuild(guildId);
      await message.reply(t('commands.settings.clear.repDone'));
      break;

    case 'roles':
      await reactionRoleService.clearAllByGuild(guildId);
      await joinRoleService.clearAllByGuild(guildId);
      await levelRoleService.clearAllByGuild(guildId);
      await message.reply(t('commands.settings.clear.rolesDone'));
      break;

    case 'all':
    case 'everything':
      await xpService.clearAllByGuild(guildId);
      await repService.clearAllByGuild(guildId);
      await reactionRoleService.clearAllByGuild(guildId);
      await joinRoleService.clearAllByGuild(guildId);
      await levelRoleService.clearAllByGuild(guildId);
      await message.reply(t('commands.settings.clear.everythingDone'));
      break;

    default:
      await message.reply(t('commands.settings.clear.unknown', { target: what }));
  }
}
