import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { t } from '../src/core/i18n.js';

const commands = [
  new SlashCommandBuilder()
    .setName('currency')
    .setDescription(t('deploy.currencyDescription'))
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription(t('deploy.currencyAmountDescription'))
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('from')
        .setDescription(t('deploy.currencyFromDescription'))
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('to')
        .setDescription(t('deploy.currencyToDescription'))
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('iss')
    .setDescription(t('deploy.issDescription')),
  new SlashCommandBuilder()
    .setName('define')
    .setDescription(t('deploy.defineDescription'))
    .addStringOption(option =>
      option.setName('word')
        .setDescription(t('deploy.defineWordDescription'))
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription(t('deploy.8ballDescription'))
    .addStringOption(option =>
      option.setName('question')
        .setDescription(t('deploy.8ballQuestionDescription'))
        .setRequired(true)
    ),
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
    ),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription(t('deploy.purgeDescription'))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription(t('deploy.purgeAmountDescription'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(option =>
      option.setName('user')
        .setDescription(t('deploy.purgeUserDescription'))
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription(t('deploy.helpDescription')),
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