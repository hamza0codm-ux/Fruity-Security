import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import {
    getGuildConfig,
} from '../database/database.js';

import {
    SECURITY_CONFIG,
} from './securityConfig.js';


/*
|--------------------------------------------------------------------------
| Get Security Log Channel
|--------------------------------------------------------------------------
*/

export async function getSecurityLogChannel(
    guild,
) {
    const config =
        await getGuildConfig(guild.id);

    const channelId =
        config?.log_channel_id ||
        SECURITY_CONFIG.logChannelId;

    if (!channelId) {
        return null;
    }

    const channel =
        guild.channels.cache.get(channelId);

    if (!channel) {
        return null;
    }

    return channel;
}


/*
|--------------------------------------------------------------------------
| Format Case Number
|--------------------------------------------------------------------------
*/

function formatCaseNumber(caseNumber) {
    if (!caseNumber) {
        return '----';
    }

    return String(caseNumber).padStart(
        4,
        '0',
    );
}


/*
|--------------------------------------------------------------------------
| Automatic Security Log
|--------------------------------------------------------------------------
*/

export async function sendAutomaticSecurityLog({
    guild,
    type,
    user,
    reason,
    details = [],
    action,
    caseNumber = null,
    userFlagCount = null,
}) {
    const channel =
        await getSecurityLogChannel(guild);

    if (!channel) {
        console.error(
            `❌ Security log channel not found for ${guild.name}.`,
        );

        return null;
    }


    const embed =
        new EmbedBuilder()
            .setTitle(
                '🚨 SECURITY ALERT',
            )
            .setDescription(
                [
                    `### Case #${formatCaseNumber(caseNumber)}`,

                    '',

                    `👤 **User**`,
                    `${user}`,

                    '',

                    `⚠️ **Security Flags**`,
                    userFlagCount !== null
                        ? `**${userFlagCount} total flag${userFlagCount === 1 ? '' : 's'}**`
                        : 'Unknown',

                    '',

                    `🛡️ **Detection**`,
                    type,

                    '',

                    `📋 **Reason**`,
                    reason,

                    '',
                    details.length
                        ? details.join('\n')
                        : '',

                    '',

                    `⏰ **Action**`,
                    action || 'No action recorded.',
                ].join('\n'),
            )
            .setTimestamp();


    return channel.send({
        embeds: [
            embed,
        ],
    });
}


/*
|--------------------------------------------------------------------------
| Staff Action Security Log
|--------------------------------------------------------------------------
*/

export async function sendStaffActionLog({
    guild,
    type,
    user,
    reason,
    details = [],
    caseNumber = null,
    userFlagCount = null,
}) {
    const channel =
        await getSecurityLogChannel(guild);

    if (!channel) {
        console.error(
            `❌ Security log channel not found for ${guild.name}.`,
        );

        return null;
    }


    const userId =
        user?.id || 'unknown';


    const embed =
        new EmbedBuilder()
            .setTitle(
                '🚨 SECURITY ALERT',
            )
            .setDescription(
                [
                    `### Case #${formatCaseNumber(caseNumber)}`,

                    '',

                    `👤 **User**`,
                    `${user}`,

                    '',

                    `⚠️ **Security Flags**`,
                    userFlagCount !== null
                        ? `**${userFlagCount} total flag${userFlagCount === 1 ? '' : 's'}**`
                        : 'Unknown',

                    '',

                    `🛡️ **Detection**`,
                    type,

                    '',

                    `📋 **Reason**`,
                    reason,

                    '',
                    details.length
                        ? details.join('\n')
                        : '',
                ].join('\n'),
            )
            .setTimestamp();


    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `security_timeout:${userId}`,
                    )
                    .setLabel('Timeout')
                    .setEmoji('⏰')
                    .setStyle(
                        ButtonStyle.Secondary,
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `security_kick:${userId}`,
                    )
                    .setLabel('Kick')
                    .setEmoji('🔨')
                    .setStyle(
                        ButtonStyle.Danger,
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `security_ban:${userId}`,
                    )
                    .setLabel('Ban')
                    .setEmoji('⛔')
                    .setStyle(
                        ButtonStyle.Danger,
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `security_dismiss:${userId}`,
                    )
                    .setLabel('Dismiss')
                    .setEmoji('✖️')
                    .setStyle(
                        ButtonStyle.Secondary,
                    ),
            );


    return channel.send({
        embeds: [
            embed,
        ],

        components: [
            row,
        ],
    });
}
