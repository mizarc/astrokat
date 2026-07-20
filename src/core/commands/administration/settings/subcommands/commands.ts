import { t } from '../../../../i18n.js';
import { guildDisabledCommandService } from '../../../../services/guildconfig/guildDisabledCommandService.js';
import { getCommands } from '../../../../router.js';

/**
 * Handle `!settings commands` to list and toggle disabled commands.
 */
export async function handleCommands(message: any, guildId: string, args: string[]): Promise<void> {
  const action = args[0]?.toLowerCase();

  if (!action || action === 'list') {
    await listCommands(message, guildId);
    return;
  }

  if (action === 'disable' || action === 'enable') {
    const commandName = args[1]?.toLowerCase();
    if (!commandName) {
      await message.reply(t('commands.settings.commands.usage'));
      return;
    }

    const allCommands = await getCommands();
    if (!allCommands.has(commandName)) {
      await message.reply(t('commands.settings.commands.notFound', { command: commandName }));
      return;
    }

    const alreadyDisabled = await guildDisabledCommandService.isDisabled(guildId, commandName);

    if (action === 'disable') {
      if (alreadyDisabled) {
        await message.reply(
          t('commands.settings.commands.alreadyDisabled', { command: commandName })
        );
        return;
      }
      await guildDisabledCommandService.add(guildId, commandName);
    } else {
      if (!alreadyDisabled) {
        await message.reply(
          t('commands.settings.commands.alreadyEnabled', { command: commandName })
        );
        return;
      }
      await guildDisabledCommandService.remove(guildId, commandName);
    }

    const key =
      action === 'disable'
        ? 'commands.settings.commands.disabled'
        : 'commands.settings.commands.enabled';
    await message.reply(t(key, { command: commandName }));
    return;
  }

  await message.reply(t('commands.settings.commands.usage'));
}

async function listCommands(message: any, guildId: string): Promise<void> {
  const allCommands = await getCommands();
  const disabledCommands = await guildDisabledCommandService.getAll(guildId);
  const disabledSet = new Set(disabledCommands);

  const lines: string[] = [];
  for (const [name, cmd] of allCommands) {
    const status = disabledSet.has(name)
      ? t('commands.settings.commands.statusDisabled')
      : t('commands.settings.commands.statusEnabled');
    lines.push(`${name} — ${status}`);
  }

  const embed = {
    title: t('commands.settings.commands.title'),
    description: lines.join('\n'),
    color: 0x5865f2,
    footer: { text: t('commands.settings.commands.footer') },
  };

  await message.reply({ content: '', embeds: [embed] });
}
