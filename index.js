import 'dotenv/config';

import { Client, GatewayIntentBits, Partials } from 'discord.js';

import { startDatabase } from './src/database/database.js';
import { registerCommands } from './src/utils/commandLoader.js';
import { registerSecurityEvents } from './src/events/securityEvents.js';

const requiredEnvironment = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'DATABASE_URL',
];

for (const variable of requiredEnvironment) {
    if (!process.env[variable]) {
        console.error(`Missing environment variable: ${variable}`);
        process.exit(1);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
    ],

    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.User,
    ],
});

client.once('ready', async () => {
    console.log(`🛡️ Fruity Security logged in as ${client.user.tag}`);

    try {
        await startDatabase();

        console.log('✅ Database ready.');

        await registerCommands(client);

        console.log('✅ Security commands registered.');
        console.log('🛡️ Fruity Security is online.');
    } catch (error) {
        console.error('Startup error:', error);
    }
});

registerSecurityEvents(client);

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

client.login(process.env.DISCORD_TOKEN);
