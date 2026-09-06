import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import { SECURITY_CONFIG } from './securityConfig.js';
import { getGuildConfig } from '../database/database.js';

function truncate(value, max = 900) {
    if (!value) {
        return 'None';
    }

    const text = String(value);

    if (text.length <= max) {
        return text;
    }

    return `${text.slice(0, max - 3)}...`;
}

export async function getSecurityLogChannel(guild) {
    const config = await getGuildConfig(guild.id);

    const channelId =
        config?.log_channel_id ||
        SECURITY_CONFIG.logChannelId;

    const channel = guild.channels.cache.get(channelId);

    if (!channel) {
        return null;
    }

    return channel;
}

export async function sendAutomaticSecurityLog({
    guild,
    type,
    user,
    reason,
    details = [],
    action,
}) {
    const channel = await getSecurityLogChannel(guild);

    if (!channel) {
        return null;
    }

    const embed = new EmbedBuilder()
        .setTitle('🚨 SECURITY ALERT')
        .setDescription(`### ${type}`)
        .addFields(
            {
                name: '👤 User',
                value: `${user} \`${user.id}\``,
                inline: false,
            },
            {
                name: '⚠️ Reason',
                value: truncate(reason),
                inline: false,
            },
            {
                name: '🛡️ Automatic Protection',
                value: action,
                inline: false,
            },
        )
        .setTimestamp();

    if (details.length) {
        embed.addFields({
            name: '📋 Details',
            value: details
                .map((item) => `• ${truncate(item, 800)}`)
                .join('\n'),
            inline: false,
        });
    }

    return channel.send({
        embeds: [embed],
    });
}

export async function sendStaffActionLog({
    guild,
    type,
    user,
    reason,
    details = [],
}) {
    const channel = await getSecurityLogChannel(guild);

    if (!channel) {
        return null;
    }

    const embed = new EmbedBuilder()
        .setTitle('🚨 SECURITY ALERT')
        .setDescription(`### ${type}`)
        .addFields(
            {
                name: '👤 User',
                value: `${user} \`${user.id}\``,
                inline: false,
            },
            {
                name: '⚠️ Reason',
                value: truncate(reason),
                inline: false,
            },
        )
        .setTimestamp();

    if (details.length) {
        embed.addFields({
            name: '📋 Details',
            value: details
                .map((item) => `• ${truncate(item, 800)}`)
                .join('\n'),
            inline: false,
        });
    }

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`security_timeout:${user.id}`)
            .setLabel('Timeout')
            .setEmoji('⏰')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`security_kick:${user.id}`)
            .setLabel('Kick')
            .setEmoji('🔨')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`security_ban:${user.id}`)
            .setLabel('Ban')
            .setEmoji('⛔')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`security_dismiss:${user.id}`)
            .setLabel('Dismiss')
            .setStyle(ButtonStyle.Secondary),
    );

    return channel.send({
        embeds: [embed],
        components: [buttons],
    });
}
