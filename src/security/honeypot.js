import {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    isWhitelisted,
} from '../database/database.js';


const HONEYPOT_LOG_CHANNEL_ID =
    '1547202840785723412';

const HONEYPOT_MARKER =
    'fruity-security:honeypot';

const HONEYPOT_FOOTER =
    'Fruity Security Honeypot';

const VALID_ACTIONS = new Set([
    'log',
    'timeout',
    'kick',
    'ban',
]);


/*
 * Discord channel types that can contain
 * normal user messages.
 */
const MESSAGE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
]);


/**
 * Check whether a channel is the configured
 * honeypot channel.
 */
export function isHoneypotChannel(channel) {
    if (!channel) {
        return false;
    }

    return (
        MESSAGE_CHANNEL_TYPES.has(channel.type) &&
        Boolean(
            channel.topic?.includes(
                HONEYPOT_MARKER,
            ),
        )
    );
}


/**
 * Find the configured honeypot channel.
 */
export function findHoneypot(guild) {
    if (!guild) {
        return null;
    }

    return (
        guild.channels.cache.find(
            (channel) =>
                channel.type ===
                    ChannelType.GuildText &&
                isHoneypotChannel(channel),
        ) || null
    );
}


/**
 * Get the configured honeypot action.
 */
export function getHoneypotAction(channel) {
    if (!channel?.topic) {
        return 'log';
    }

    const match =
        channel.topic.match(
            /fruity-security:honeypot\s*\|\s*action=(log|timeout|kick|ban)/i,
        );

    if (!match) {
        return 'log';
    }

    const action =
        match[1].toLowerCase();

    return VALID_ACTIONS.has(action)
        ? action
        : 'log';
}


/**
 * Build the persistent honeypot topic.
 */
function buildHoneypotTopic(
    existingTopic,
    action,
) {
    const cleanTopic =
        (existingTopic || '')
            .replace(
                /\s*\|?\s*fruity-security:honeypot(?:\s*\|\s*action=(?:log|timeout|kick|ban))?/gi,
                '',
            )
            .trim();

    const marker =
        `${HONEYPOT_MARKER} | action=${action}`;

    if (!cleanTopic) {
        return marker;
    }

    return `${cleanTopic} | ${marker}`;
}


/**
 * Remove the honeypot marker from a topic.
 */
function removeHoneypotMarker(topic) {
    return (
        (topic || '')
            .replace(
                /\s*\|?\s*fruity-security:honeypot(?:\s*\|\s*action=(?:log|timeout|kick|ban))?/gi,
                '',
            )
            .trim()
    );
}


/**
 * Configure a channel as the honeypot.
 */
export async function setupHoneypot(
    guild,
    channel,
    action = 'log',
) {
    if (!guild) {
        throw new Error(
            'Guild is required.',
        );
    }

    if (
        !channel ||
        channel.guildId !== guild.id ||
        channel.type !== ChannelType.GuildText
    ) {
        throw new Error(
            'The honeypot must be a normal server text channel.',
        );
    }

    if (!VALID_ACTIONS.has(action)) {
        throw new Error(
            'Invalid honeypot action.',
        );
    }

    /*
     * Remove the marker from the old
     * honeypot if another channel is configured.
     */
    const previous =
        findHoneypot(guild);

    if (
        previous &&
        previous.id !== channel.id
    ) {
        try {
            await previous.setTopic(
                removeHoneypotMarker(
                    previous.topic,
                ) || null,
                'Moving Fruity Security honeypot',
            );
        } catch (error) {
            console.error(
                'Failed to remove old honeypot marker:',
                error,
            );
        }
    }

    /*
     * Configure the new honeypot.
     */
    await channel.setTopic(
        buildHoneypotTopic(
            channel.topic,
            action,
        ),
        'Configure Fruity Security honeypot',
    );

    /*
     * Make sure the warning message exists.
     */
    try {
        const messages =
            await channel.messages.fetch({
                limit: 50,
            });

        const existingWarning =
            messages.find(
                (message) =>
                    message.author.id ===
                        guild.client.user?.id &&
                    message.embeds.some(
                        (embed) =>
                            embed.footer?.text ===
                            HONEYPOT_FOOTER,
                    ),
            );

        if (!existingWarning) {
            const warningEmbed =
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
                            'Your messages sent today may be deleted, and you may receive a **1 week timeout or a ban**.',
                        ].join('\n'),
                    )
                    .setFooter({
                        text: HONEYPOT_FOOTER,
                    })
                    .setTimestamp();

            await channel.send({
                embeds: [
                    warningEmbed,
                ],
            });
        }
    } catch (error) {
        console.error(
            'Failed to send honeypot warning:',
            error,
        );
    }

    return channel;
}


/**
 * Disable the honeypot.
 */
export async function disableHoneypot(
    guild,
) {
    const channel =
        findHoneypot(guild);

    if (!channel) {
        return false;
    }

    await channel.setTopic(
        removeHoneypotMarker(
            channel.topic,
        ) || null,
        'Disable Fruity Security honeypot',
    );

    return true;
}


/**
 * Get the start of today in UTC.
 */
function getStartOfToday() {
    const now = new Date();

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


/**
 * Check whether a message was sent today.
 */
function wasSentToday(
    message,
    startOfToday,
) {
    return (
        message.createdTimestamp >=
        startOfToday.getTime()
    );
}


/**
 * Get all channels that can contain
 * messages we can inspect.
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


/**
 * Delete messages from one channel.
 *
 * Only messages from today are deleted.
 */
async function deleteUserMessagesFromChannel(
    channel,
    userId,
    startOfToday,
) {
    let deletedCount = 0;

    /*
     * Not every channel type exposes the same
     * message permissions/methods.
     */
    if (
        !channel.messages ||
        typeof channel.messages.fetch !==
            'function'
    ) {
        return 0;
    }

    let before;

    while (true) {
        let messages;

        try {
            const options = {
                limit: 100,
            };

            if (before) {
                options.before = before;
            }

            messages =
                await channel.messages.fetch(
                    options,
                );
        } catch (error) {
            /*
             * Missing permissions in one channel
             * should never stop the server-wide
             * cleanup.
             */
            console.error(
                `Honeypot could not read #${channel.name}:`,
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
                    wasSentToday(
                        message,
                        startOfToday,
                    ),
            );

        /*
         * Anything older than today means we
         * have reached the point where we can stop
         * scanning backwards.
         */
        const hasOlderMessages =
            messages.some(
                (message) =>
                    message.createdTimestamp <
                    startOfToday.getTime(),
            );

        /*
         * Delete in batches where possible.
         */
        if (userMessages.size) {
            const messageIds =
                [...userMessages.keys()];

            for (
                let index = 0;
                index < messageIds.length;
                index += 100
            ) {
                const batch =
                    messageIds.slice(
                        index,
                        index + 100,
                    );

                /*
                 * Bulk delete works for messages
                 * younger than 14 days, which
                 * includes all messages from today.
                 */
                try {
                    if (
                        typeof channel.bulkDelete ===
                        'function'
                    ) {
                        const deleted =
                            await channel.bulkDelete(
                                batch,
                                true,
                            );

                        deletedCount +=
                            deleted.size;
                    } else {
                        for (
                            const messageId of batch
                        ) {
                            try {
                                await channel.messages.delete(
                                    messageId,
                                );

                                deletedCount++;
                            } catch (error) {
                                console.error(
                                    `Failed deleting message ${messageId} in #${channel.name}:`,
                                    error,
                                );
                            }
                        }
                    }
                } catch (error) {
                    /*
                     * Fall back to individual deletes
                     * if bulk deletion fails.
                     */
                    for (
                        const messageId of batch
                    ) {
                        try {
                            await channel.messages.delete(
                                messageId,
                            );

                            deletedCount++;
                        } catch (deleteError) {
                            console.error(
                                `Failed deleting message ${messageId} in #${channel.name}:`,
                                deleteError,
                            );
                        }
                    }
                }
            }
        }

        if (hasOlderMessages) {
            break;
        }

        /*
         * Move backwards through channel history.
         */
        const oldest =
            messages.last();

        if (!oldest) {
            break;
        }

        before = oldest.id;
    }

    return deletedCount;
}


/**
 * Delete all messages sent by a user today
 * throughout the entire server.
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
        /*
         * Never delete the honeypot's own bot
         * warning message.
         */
        if (
            channel.id ===
            findHoneypot(guild)?.id
        ) {
            /*
             * We still scan the honeypot because
             * the user's own trigger message needs
             * to be removed.
             */
        }

        const deleted =
            await deleteUserMessagesFromChannel(
                channel,
                userId,
                startOfToday,
            );

        deletedCount += deleted;
        scannedChannels++;

        /*
         * Small delay to reduce API pressure when
         * scanning large servers.
         */
        await new Promise((resolve) =>
            setTimeout(resolve, 150),
        );
    }

    return {
        deletedCount,
        scannedChannels,
    };
}


/**
 * Get the dedicated honeypot log channel.
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


/**
 * Send the honeypot alert.
 */
async function sendHoneypotLog({
    guild,
    member,
    message,
    action,
    result,
    deletedCount,
    scannedChannels,
}) {
    const logChannel =
        await getHoneypotLogChannel(
            guild,
        );

    if (!logChannel) {
        console.error(
            `Honeypot log channel ${HONEYPOT_LOG_CHANNEL_ID} was not found or is not text based.`,
        );

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
                        `${member} \`${member.user.tag}\``,
                    inline: true,
                },
                {
                    name: '🆔 User ID',
                    value:
                        `\`${member.id}\``,
                    inline: true,
                },
                {
                    name: '📍 Trigger Channel',
                    value:
                        `<#${message.channel.id}>`,
                    inline: true,
                },
                {
                    name: '💬 Trigger Message',
                    value:
                        message.content
                            ? message.content
                                .slice(0, 1024)
                            : '[Attachment / no text]',
                    inline: false,
                },
                {
                    name: '🗑️ Messages Deleted Today',
                    value:
                        `**${deletedCount}**`,
                    inline: true,
                },
                {
                    name: '📂 Channels Scanned',
                    value:
                        `**${scannedChannels}**`,
                    inline: true,
                },
                {
                    name: '⚡ Action',
                    value:
                        `\`${action}\``,
                    inline: true,
                },
                {
                    name: '📋 Result',
                    value:
                        result
                            .slice(0, 1024),
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


/**
 * Handle a message inside the honeypot.
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
     * Never punish bots.
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

    const action =
        getHoneypotAction(
            message.channel,
        );

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
     * Delete this user's messages from
     * EVERY accessible channel today.
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

    let result =
        'Message cleanup completed.';

    /*
     * Apply the configured punishment.
     */
    try {
        if (action === 'timeout') {
            if (
                message.member.moderatable
            ) {
                await message.member.timeout(
                    7 * 24 * 60 * 60 * 1000,
                    'Fruity Security honeypot triggered',
                );

                result =
                    'User received a 1 week timeout.';
            } else {
                result =
                    'Could not timeout the user because the bot cannot moderate them.';
            }
        }

        if (action === 'kick') {
            if (
                message.member.kickable
            ) {
                await message.member.kick(
                    'Fruity Security honeypot triggered',
                );

                result =
                    'User was kicked.';
            } else {
                result =
                    'Could not kick the user because the bot cannot kick them.';
            }
        }

        if (action === 'ban') {
            if (
                message.member.bannable
            ) {
                await message.guild.members.ban(
                    message.author.id,
                    {
                        deleteMessageSeconds: 0,
                        reason:
                            'Fruity Security honeypot triggered',
                    },
                );

                result =
                    'User was banned.';
            } else {
                result =
                    'Could not ban the user because the bot cannot ban them.';
            }
        }

        if (action === 'log') {
            result =
                'Logged only. No punishment was configured.';
        }
    } catch (error) {
        console.error(
            'Honeypot punishment failed:',
            error,
        );

        result =
            `Punishment failed: ${
                error.message || 'Unknown error'
            }`;
    }

    await sendHoneypotLog({
        guild: message.guild,
        member: message.member,
        message,
        action,
        result,
        deletedCount,
        scannedChannels,
    });

    console.warn(
        `[HONEYPOT] ${message.author.tag} (${message.author.id}) triggered the honeypot. ` +
        `Deleted ${deletedCount} messages across ${scannedChannels} channels. ` +
        `Action: ${action}`,
    );
}


/**
 * Register the honeypot message listener.
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
