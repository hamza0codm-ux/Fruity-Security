import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';

import {
    getGuildConfig,
    getStats,
    addWhitelist,
    removeWhitelist,
    getWhitelist,
} from '../database/database.js';

import {
    lockdownGuild,
    unlockGuild,
    scanGuild,
} from '../security/securityService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('security')
        .setDescription('Manage Fruity Security.')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild,
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('View Fruity Security status.'),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('scan')
                .setDescription('Scan the server for security problems.'),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('lockdown')
                .setDescription('Lock down the server.'),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('unlock')
                .setDescription('Remove server lockdown.'),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('whitelist')
                .setDescription('Whitelist a user.')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('User to whitelist.')
                        .setRequired(true),
                ),
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('unwhitelist')
                .setDescription('Remove a user from the whitelist.')
                .addUserOption((option) =>
                    option
                        .setName('user')
                        .setDescription('User to remove.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ This command can only be used in a server.',
                ephemeral: true,
            });
        }

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild,
            )
        ) {
            return interaction.reply({
                content: '❌ You need **Manage Server** to use this command.',
                ephemeral: true,
            });
        }

        const subcommand =
            interaction.options.getSubcommand();

        if (subcommand === 'status') {
            return showStatus(interaction);
        }

        if (subcommand === 'scan') {
            return runScan(interaction);
        }

        if (subcommand === 'lockdown') {
            return runLockdown(interaction);
        }

        if (subcommand === 'unlock') {
            return runUnlock(interaction);
        }

        if (subcommand === 'whitelist') {
            return runWhitelist(interaction);
        }

        if (subcommand === 'unwhitelist') {
            return runUnwhitelist(interaction);
        }
    },
};

async function showStatus(interaction) {
    const stats =
        await getStats(
            interaction.guild.id,
        );

    const whitelist =
        await getWhitelist(
            interaction.guild.id,
        );

    const embed = new EmbedBuilder()
        .setTitle('🛡️ Fruity Security')
        .setDescription(
            'Security monitoring and protection for your server.',
        )
        .addFields(
            {
                name: '🛡️ SYSTEM',
                value:
                    `${stats.enabled ? '🟢 Protection Active' : '🔴 Protection Disabled'}\n` +
                    `${stats.lockdown ? '🔴 Lockdown Active' : '🟢 Lockdown Disabled'}\n` +
                    `${stats.raid_mode ? '🔴 Raid Mode Active' : '🟢 Raid Mode Inactive'}`,
                inline: false,
            },
            {
                name: '🚨 SECURITY CASES',
                value:
                    `🔗 Phishing: **${stats.phishing_cases}**\n` +
                    `💬 Spam: **${stats.spam_cases}**\n` +
                    `🚨 Raids: **${stats.raid_cases}**\n` +
                    `☢️ Nuke Attempts: **${stats.nuke_cases}**`,
                inline: true,
            },
            {
                name: '⚠️ PROBLEMS',
                value:
                    `🚨 Total Incidents: **${stats.total_incidents}**\n` +
                    `🛡️ Threats Blocked: **${stats.threats_blocked}**\n` +
                    `👤 Suspicious Accounts: **${stats.suspicious_accounts}**`,
                inline: true,
            },
            {
                name: '🔍 SERVER',
                value:
                    `👮 Whitelisted: **${whitelist.length}**\n` +
                    `🤖 Bots: **${stats.bots || 0}**\n` +
                    `🔑 Dangerous Roles: **${stats.dangerous_roles || 0}**\n` +
                    `⚠️ Dangerous Permissions: **${stats.dangerous_permissions || 0}**`,
                inline: true,
            },
        )
        .setFooter({
            text: 'Fruity Security • Detect → Verify → Protect → Log',
        })
        .setTimestamp();

    return interaction.reply({
        embeds: [embed],
        ephemeral: true,
    });
}

async function runScan(interaction) {
    await interaction.deferReply({
        ephemeral: true,
    });

    const scan =
        await scanGuild(
            interaction.guild,
        );

    const problemCount =
        scan.problems.length;

    const embed = new EmbedBuilder()
        .setTitle('🔍 Fruity Security Scan')
        .setDescription(
            problemCount
                ? `⚠️ **${problemCount} security problem(s) found.**`
                : '✅ **No obvious security problems found.**',
        )
        .addFields(
            {
                name: '👥 Members',
                value: `${scan.membersChecked} checked`,
                inline: true,
            },
            {
                name: '🔑 Roles',
                value:
                    `${scan.rolesChecked} checked\n` +
                    `⚠️ ${scan.dangerousRoles} dangerous`,
                inline: true,
            },
            {
                name: '🤖 Bots',
                value: `${scan.bots} found`,
                inline: true,
            },
            {
                name: '⚠️ Permissions',
                value: `${scan.dangerousPermissions} dangerous`,
                inline: true,
            },
            {
                name: '🚨 TOTAL PROBLEMS',
                value: `**${problemCount}**`,
                inline: true,
            },
        )
        .setTimestamp();

    if (scan.problems.length) {
        embed.addFields({
            name: '📋 Problems',
            value: scan.problems
                .slice(0, 20)
                .map((problem) => `• ${problem}`)
                .join('\n')
                .slice(0, 1024),
            inline: false,
        });
    }

    return interaction.editReply({
        embeds: [embed],
    });
}

async function runLockdown(interaction) {
    await interaction.deferReply({
        ephemeral: true,
    });

    const changed =
        await lockdownGuild(
            interaction.guild,
        );

    return interaction.editReply({
        content:
            `🔒 **Fruity Security Lockdown activated.**\n\n` +
            `Restricted channels: **${changed}**`,
    });
}

async function runUnlock(interaction) {
    await interaction.deferReply({
        ephemeral: true,
    });

    const changed =
        await unlockGuild(
            interaction.guild,
        );

    return interaction.editReply({
        content:
            `🔓 **Fruity Security Lockdown removed.**\n\n` +
            `Updated channels: **${changed}**`,
    });
}

async function runWhitelist(interaction) {
    const user =
        interaction.options.getUser('user', true);

    await addWhitelist(
        interaction.guild.id,
        user.id,
    );

    return interaction.reply({
        content:
            `👮 ${user} has been added to the Fruity Security whitelist.`,
        ephemeral: true,
    });
}

async function runUnwhitelist(interaction) {
    const user =
        interaction.options.getUser('user', true);

    await removeWhitelist(
        interaction.guild.id,
        user.id,
    );

    return interaction.reply({
        content:
            `👮 ${user} has been removed from the Fruity Security whitelist.`,
        ephemeral: true,
    });
}
