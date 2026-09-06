import 'dotenv/config';

import {
    Client,
    GatewayIntentBits,
    Partials,
} from 'discord.js';

import {
    startDatabase,
} from './src/database/database.js';

import {
    registerCommands,
} from './src/utils/commandLoader.js';

import {
    registerSecurityEvents,
} from './src/events/securityEvents.js';

import {
    registerInteractionEvents,
} from './src/events/interactionCreate.js';


/*
|--------------------------------------------------------------------------
| Environment
|--------------------------------------------------------------------------
*/

const requiredEnvironment = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'DATABASE_URL',
];

for (const variable of requiredEnvironment) {
    if (!process.env[variable]) {
        console.error(
            `❌ Missing environment variable: ${variable}`,
        );

        process.exit(1);
    }
}


/*
|--------------------------------------------------------------------------
| Discord Client
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| Security Events
|--------------------------------------------------------------------------
*/

registerSecurityEvents(client);

registerInteractionEvents(client);


/*
|--------------------------------------------------------------------------
| Bot Ready
|--------------------------------------------------------------------------
*/

client.once('ready', async () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🛡️  FRUITY SECURITY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log(
        `👤 Logged in as: ${client.user.tag}`,
    );

    console.log(
        `🆔 Bot ID: ${client.user.id}`,
    );

    console.log(
        `🏠 Servers: ${client.guilds.cache.size}`,
    );

    console.log('');


    /*
    |--------------------------------------------------------------------------
    | Database
    |--------------------------------------------------------------------------
    */

    try {
        await startDatabase();

        console.log('✅ PostgreSQL database connected.');
    } catch (error) {
        console.error(
            '❌ Failed to initialize PostgreSQL:',
            error,
        );

        process.exit(1);
    }


    /*
    |--------------------------------------------------------------------------
    | Slash Commands
    |--------------------------------------------------------------------------
    */

    try {
        await registerCommands(client);

        console.log(
            '✅ Slash commands registered.',
        );
    } catch (error) {
        console.error(
            '❌ Failed to register slash commands:',
            error,
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Ready
    |--------------------------------------------------------------------------
    */

    console.log('');
    console.log('🛡️ Fruity Security is ONLINE.');
    console.log('');
    console.log('🔗 Anti-Phishing: ACTIVE');
    console.log('💬 Anti-Spam: ACTIVE');
    console.log('🚨 Anti-Raid: ACTIVE');
    console.log('☢️ Anti-Nuke: ACTIVE');
    console.log('🔒 Lockdown: READY');
    console.log('🔍 Security Scan: READY');
    console.log('👮 Whitelist: READY');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

process.on(
    'unhandledRejection',
    (error) => {
        console.error(
            '❌ Unhandled Promise Rejection:',
            error,
        );
    },
);

process.on(
    'uncaughtException',
    (error) => {
        console.error(
            '❌ Uncaught Exception:',
            error,
        );
    },
);


/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

client.login(
    process.env.DISCORD_TOKEN,
);
