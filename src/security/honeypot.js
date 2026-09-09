import {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    isWhitelisted,
} from '../database/database.js';


/*
|--------------------------------------------------------------------------
| Honeypot Configuration
|--------------------------------------------------------------------------
*/

const HONEYPOT_CHANNEL_NAME =
    '🍯・verification';

const HONEYPOT_MARKER =
    'fruity-security:honeypot';

const HONEYPOT_LOG_CHANNEL_ID =
    '1547202840785723412';

const HONEYPOT_ACTION =
    'timeout';

const HONEYPOT_TIMEOUT_MS =
    7 * 24 * 60 * 60 * 1000;

const HONEYPOT_FOOTER =
    'Fruity Security Honeypot';


/*
|--------------------------------------------------------------------------
| Message-capable channel types
|--------------------------------------------------------------------------
*/

const MESSAGE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
]);


/*
|--------------------------------------------------------------------------
| Honeypot Detection
|--------------------------------------------------------------------------
*/

export function isHoneypotChannel(channel) {
    if (!channel) {
        return false;
    }

    return (
        channel.type === ChannelType.GuildText &&
        Boolean(
            channel.topic?.includes(
                HONEYPOT_MARKER,
            ),
        )
    );
}


/*
|--------------------------------------------------------------------------
| Find Honeypot
|--------------------------------------------------------------------------
*/

export function findHoneypot(guild) {
    if (!guild) {
        return null;
    }

    return (
        guild.channels.cache.find(
            (channel) =>
                isHoneypotChannel(channel),
        ) || null
    );
}


/*
|--------------------------------------------------------------------------
| Honeypot Topic
|--------------------------------------------------------------------------
*/

function buildHoneypotTopic() {
    return (
        `${HONEYPOT_MARKER} | action=${HONEYPOT_ACTION}`
    );
}


/*
|--------------------------------------------------------------------------
| Automatic Honeypot Panel
|--------------------------------------------------------------------------
*/

export async function ensureHoneypotPanel(
    guild,
) {
    if (!guild) {
        return null;
    }

    /*
     * First look for an existing configured
     * honeypot.
     */
    let channel =
        findHoneypot(guild);

    /*
     * If it doesn't exist, look for the
     * expected channel name.
     */
    if (!channel) {
        channel =
            guild.channels.cache.find(
                (item) =>
                    item.type ===
                        ChannelType.GuildText &&
                    item.name ===
                        HONEYPOT_CHANNEL_NAME,
            ) || null;
    }

    /*
     * Create the channel automatically if
     * it does not exist.
     */
    if (!channel) {
        try {
            channel =
                await guild.channels.create({
                    name:
                        HONEYPOT_CHANNEL_NAME,

                    type:
                        ChannelType.GuildText,

                    topic:
                        buildHoneypotTopic(),

                    reason:
                        'Create Fruity Security automatic honeypot',
                });
        } catch (error) {
            console.error(
                `Failed to create honeypot channel in ${guild.name}:`,
                error,
            );

            return null;
        }
    } else {
        /*
         * Make sure the existing channel remains
         * configured as the honeypot.
         */
        try {
            await channel.setTopic(
                buildHoneypotTopic(),
                'Maintain Fruity Security honeypot',
            );
        } catch (error) {
            console.error(
                'Failed to update honeypot channel topic:',
                error,
            );
        }
    }

    /*
     * Make sure the channel has the correct name.
     */
    if (
        channel.name !==
        HONEYPOT_CHANNEL_NAME
    ) {
        try {
            await channel.setName(
                HONEYPOT_CHANNEL_NAME,
                'Maintain Fruity Security honeypot',
            );
        } catch (error) {
            console.error(
                'Failed to rename honeypot channel:',
                error,
            );
        }
    }

    /*
     * Send/update the warning panel.
     */
    await sendHoneypotPanel(
        channel,
    );

    return channel;
}


/*
|--------------------------------------------------------------------------
| Honeypot Warning Panel
|--------------------------------------------------------------------------
*/

async function sendHoneypotPanel(
    channel,
) {
    try {
        const messages =
            await channel.messages.fetch({
                limit: 50,
            });

        const existing =
            messages.find(
                (message) =>
                    message.author.id ===
                        channel.client.user.id &&
                    message.embeds.some(
                        (embed) =>
                            embed.footer?.text ===
                            HONEYPOT_FOOTER,
                    ),
            );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    '🍯 Do Not Chat In This Channel',
                )
                .setDescription(
                    [
                        'This channel is **not for chatting**.',
                        '',
                        'Sending **any message or attachment** here will trigger Fruity Security.',
                        '',
                        '🗑️ **Messages sent today** will be deleted across the server.',
                        '',
                        '⏱️ You will receive a **1 week timeout**.',
                        '',
                        '⚠️ Do not send messages, images, files, links, or attachments here.',
                    ].join('\n'),
                )
                .setFooter({
                    text:
                        HONEYPOT_FOOTER,
                })
                .setTimestamp();

        if (existing) {
            await existing.edit({
                embeds: [embed],
            });
        } else {
            await channel.send({
                embeds: [embed],
            });
        }
    } catch (error) {
        console.error(
            'Failed to send honeypot panel:',
            error,
        );
    }
}


/*
|--------------------------------------------------------------------------
| Start of Today
|--------------------------------------------------------------------------
*/

function getStartOfToday() {
    const now =
        new Date();

    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
            0,
        ),
    );
}


/*
|--------------------------------------------------------------------------
| Get Message Channels
|--------------------------------------------------------------------------
*/

function getMessageChannels(guild) {
    return [
        ...guild.channels.cache.values(),
    ].filter(
        (channel) =>
            MESSAGE_CHANNEL_TYPES.has(
                channel.type,
            ),
    );
}


/*
|--------------------------------------------------------------------------
| Delete User Messages In Channel
|--------------------------------------------------------------------------
*/

async function deleteUserMessagesFromChannel(
    channel,
    userId,
    startOfToday,
) {
    if (
        !channel.messages ||
        typeof channel.messages.fetch !==
            'function'
    ) {
        return 0;
    }

    let deletedCount = 0;
    let before;

    while (true) {
        let messages;

        try {
            const options = {
                limit: 100,
            };

            if (before) {
                options.before =
                    before;
            }

            messages =
                await channel.messages.fetch(
                    options,
                );
        } catch (error) {
            console.error(
                `Could not read #${channel.name}:`,
                error,
            );

            break;
        }

        if (!messages.size) {
            break;
        }

        const userMessages =
            messages.filter(
                (message) =>
                    message.author?.id ===
                        userId &&
                    message.createdTimestamp >=
                        startOfToday.getTime(),
            );

        const hasOlderMessages =
            messages.some(
                (message) =>
                    message.createdTimestamp <
                    startOfToday.getTime(),
            );

        if (userMessages.size) {
            const ids =
                [...userMessages.keys()];

            /*
             * All messages from today are less
             * than 14 days old, so bulk deletion
             * can be used.
             */
            try {
                if (
                    typeof channel.bulkDelete ===
                    'function'
                ) {
                    const deleted =
                        await channel.bulkDelete(
                            ids,
                            true,
                        );

                    deletedCount +=
                        deleted.size;
                } else {
                    for (const id of ids) {
                        try {
                            await channel.messages.delete(
                                id,
                            );

                            deletedCount++;
                        } catch {
                            // Ignore individual deletion failures.
                        }
                    }
                }
            } catch {
                /*
                 * Fall back to individual deletes.
                 */
                for (const id of ids) {
                    try {
                        await channel.messages.delete(
                            id,
                        );

                        deletedCount++;
                    } catch {
                        // Ignore individual deletion failures.
                    }
                }
            }
        }

        if (hasOlderMessages) {
            break;
        }

        const oldest =
            messages.last();

        if (!oldest) {
            break;
        }

        before =
            oldest.id;
    }

    return deletedCount;
}


/*
|--------------------------------------------------------------------------
| Delete User Messages Across Server
|--------------------------------------------------------------------------
*/

async function deleteUserMessagesFromServer(
    guild,
    userId,
) {
    const startOfToday =
        getStartOfToday();

    const channels =
        getMessageChannels(guild);

    let deletedCount = 0;
    let scannedChannels = 0;

    for (const channel of channels) {
        try {
            const deleted =
                await deleteUserMessagesFromChannel(
                    channel,
                    userId,
                    startOfToday,
                );

            deletedCount +=
                deleted;

            scannedChannels++;
        } catch (error) {
            console.error(
                `Honeypot cleanup failed in #${channel.name}:`,
                error,
            );
        }

        /*
         * Avoid hammering Discord's API.
         */
        await new Promise(
            (resolve) =>
                setTimeout(
                    resolve,
                    150,
                ),
        );
    }

    return {
        deletedCount,
        scannedChannels,
    };
}


/*
|--------------------------------------------------------------------------
| Honeypot Log Channel
|--------------------------------------------------------------------------
*/

async function getHoneypotLogChannel(
    guild,
) {
    let channel =
        guild.channels.cache.get(
            HONEYPOT_LOG_CHANNEL_ID,
        );

    if (!channel) {
        try {
            channel =
                await guild.channels.fetch(
                    HONEYPOT_LOG_CHANNEL_ID,
                );
        } catch (error) {
            console.error(
                'Failed to fetch honeypot log channel:',
                error,
            );

            return null;
        }
    }

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return null;
    }

    return channel;
}


/*
|--------------------------------------------------------------------------
| Send Honeypot Alert
|--------------------------------------------------------------------------
*/

async function sendHoneypotLog({
    guild,
    member,
    message,
    deletedCount,
    scannedChannels,
    result,
}) {
    const logChannel =
        await getHoneypotLogChannel(
            guild,
        );

    if (!logChannel) {
        return;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                '🍯 HONEYPOT TRIGGERED',
            )
            .setDescription(
                `**${member.user.tag}** triggered the Fruity Security honeypot.`,
            )
            .addFields(
                {
                    name: '👤 User',
                    value:
                        `${member}\n\`${member.user.tag}\``,
                    inline: true,
                },
                {
                    name: '🆔 User ID',
                    value:
                        `\`${member.id}\``,
                    inline: true,
                },
                {
                    name: '📍 Triggered In',
                    value:
                        `<#${message.channel.id}>`,
                    inline: true,
                },
                {
                    name: '💬 Trigger',
                    value:
                        message.content
                            ? message.content.slice(
                                0,
                                1024,
                            )
                            : '[Attachment / no text]',
                    inline: false,
                },
                {
                    name: '🗑️ Deleted Today',
                    value:
                        `**${deletedCount} messages**`,
                    inline: true,
                },
                {
                    name: '📂 Channels Scanned',
                    value:
                        `**${scannedChannels}**`,
                    inline: true,
                },
                {
                    name: '⏱️ Punishment',
                    value:
                        '**1 Week Timeout**',
                    inline: true,
                },
                {
                    name: '📋 Result',
                    value:
                        result.slice(
                            0,
                            1024,
                        ),
                    inline: false,
                },
                {
                    name: '📅 Account Created',
                    value:
                        `<t:${Math.floor(
                            member.user.createdTimestamp /
                            1000,
                        )}:F>`,
                    inline: false,
                },
            )
            .setFooter({
                text:
                    'Fruity Security • Honeypot',
            })
            .setTimestamp();

    try {
        await logChannel.send({
            embeds: [embed],
        });
    } catch (error) {
        console.error(
            'Failed to send honeypot alert:',
            error,
        );
    }
}


/*
|--------------------------------------------------------------------------
| Honeypot Message Handler
|--------------------------------------------------------------------------
*/

export async function handleHoneypotMessage(
    message,
) {
    if (!message?.guild) {
        return;
    }

    if (!message.member) {
        return;
    }

    if (
        !isHoneypotChannel(
            message.channel,
        )
    ) {
        return;
    }

    /*
     * Ignore bots.
     */
    if (message.author.bot) {
        return;
    }

    /*
     * Never punish the server owner.
     */
    if (
        message.guild.ownerId ===
        message.author.id
    ) {
        return;
    }

    /*
     * Staff with Manage Server are ignored.
     */
    if (
        message.member.permissions.has(
            PermissionFlagsBits.ManageGuild,
        )
    ) {
        return;
    }

    /*
     * Whitelisted users are ignored.
     */
    try {
        if (
            await isWhitelisted(
                message.guild.id,
                message.author.id,
            )
        ) {
            return;
        }
    } catch (error) {
        console.error(
            'Honeypot whitelist check failed:',
            error,
        );

        return;
    }

    /*
     * Delete the trigger immediately.
     */
    try {
        if (message.deletable) {
            await message.delete();
        }
    } catch (error) {
        console.error(
            'Failed to delete honeypot trigger:',
            error,
        );
    }

    /*
     * Delete all messages sent today
     * across the server.
     */
    let deletedCount = 0;
    let scannedChannels = 0;

    try {
        const cleanup =
            await deleteUserMessagesFromServer(
                message.guild,
                message.author.id,
            );

        deletedCount =
            cleanup.deletedCount;

        scannedChannels =
            cleanup.scannedChannels;
    } catch (error) {
        console.error(
            'Server-wide honeypot cleanup failed:',
            error,
        );
    }

    /*
     * Apply 1 week timeout.
     */
    let result;

    try {
        if (
            message.member.moderatable
        ) {
            await message.member.timeout(
                HONEYPOT_TIMEOUT_MS,
                'Fruity Security honeypot triggered',
            );

            result =
                'User received a 1 week timeout.';
        } else {
            result =
                'Could not timeout the user because the bot cannot moderate them.';
        }
    } catch (error) {
        console.error(
            'Honeypot timeout failed:',
            error,
        );

        result =
            `Timeout failed: ${
                error.message ||
                'Unknown error'
            }`;
    }

    /*
     * Send security alert.
     */
    await sendHoneypotLog({
        guild:
            message.guild,

        member:
            message.member,

        message,

        deletedCount,

        scannedChannels,

        result,
    });

    console.warn(
        `[HONEYPOT] ${message.author.tag} (${message.author.id}) triggered the honeypot. ` +
        `Deleted ${deletedCount} messages across ${scannedChannels} channels.`,
    );
}


/*
|--------------------------------------------------------------------------
| Register Honeypot Events
|--------------------------------------------------------------------------
*/

export function registerHoneypotEvents(
    client,
) {
    client.on(
        'messageCreate',
        async (message) => {
            try {
                await handleHoneypotMessage(
                    message,
                );
            } catch (error) {
                console.error(
                    'Honeypot message handler error:',
                    error,
                );
            }
        },
    );
}
