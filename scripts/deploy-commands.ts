import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('Fetches Wikipedia information.')
    .addStringOption(option => 
    option.setName('query')
      .setDescription('The topic to search for')
      .setRequired(true) // Force the user to provide a search term
    ),
  new SlashCommandBuilder()
    .setName('color')
    .setDescription('Shows a color preview with RGB, HSL, and CMYK values.')
    .addStringOption(option => 
    option.setName('hex')
      .setDescription('The hex color to display')
      .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Sets a reminder for a specified time.')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('When to remind you (e.g. "in 5 minutes", "tomorrow at 3pm")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('What to remind you about')
        .setRequired(false)
    )
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_ID!), 
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();