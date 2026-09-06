import { REST, Routes } from 'discord.js';

import securityCommand from '../commands/security.js';

export async function registerCommands() {
    const commands = [
        securityCommand.data.toJSON(),
    ];

    const rest = new REST({
        version: '10',
    }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        {
            body: commands,
        },
    );
}
