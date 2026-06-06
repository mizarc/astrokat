import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { t } from '../src/core/i18n.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription(t('deploy.pingDescription')),
  new SlashCommandBuilder()
    .setName('wiki')
    .setDescription(t('deploy.wikiDescription'))
    .addStringOption(option => 
    option.setName('query')
      .setDescription(t('deploy.wikiQueryDescription'))
      .setRequired(true) // Force the user to provide a search term
    ),
  new SlashCommandBuilder()
    .setName('color')
    .setDescription(t('deploy.colorDescription'))
    .addStringOption(option => 
    option.setName('hex')
      .setDescription(t('deploy.colorHexDescription'))
      .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('remindme')
    .setDescription(t('deploy.remindmeDescription'))
    .addStringOption(option =>
      option.setName('time')
        .setDescription(t('deploy.remindmeTimeDescription'))
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription(t('deploy.remindmeMessageDescription'))
        .setRequired(false)
    )
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log(t('deploy.starting'));
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_ID!), 
      { body: commands },
    );
    console.log(t('deploy.success'));
  } catch (error) {
    console.error(error);
  }
})();