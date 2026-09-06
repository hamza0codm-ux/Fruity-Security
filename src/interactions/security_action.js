import {
    PermissionFlagsBits,
} from 'discord.js';

export async function handleSecurityAction(interaction) {
    if (!interaction.isButton()) {
        return false;
    }

    if (
        !interaction.customId.startsWith(
            'security_',
        )
    ) {
        return false;
    }

    if (
        !interaction.memberPermissions?.has(
            PermissionFlagsBits.ModerateMembers,
        ) &&
        !interaction.memberPermissions?.has(
            PermissionFlagsBits.KickMembers,
        ) &&
        !interaction.memberPermissions?.has(
            PermissionFlagsBits.BanMembers,
        )
    ) {
        await interaction.reply({
            content:
                '❌ You do not have permission to handle security incidents.',
            ephemeral: true,
        });

        return true;
    }

    const [action, userId] =
        interaction.customId.split(':');

    const member =
        await interaction.guild.members
            .fetch(userId)
            .catch(() => null);

    if (!member) {
        await interaction.reply({
            content:
                '❌ That user is no longer in the server.',
            ephemeral: true,
        });

        return true;
    }

    try {
        if (action === 'security_timeout') {
            if (
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.ModerateMembers,
                )
            ) {
                throw new Error(
                    'You need Moderate Members.',
                );
            }

            await member.timeout(
                10 * 60 * 1000,
                `Fruity Security action by ${interaction.user.tag}`,
            );

            await markHandled(
                interaction,
                `⏰ Timed out by ${interaction.user}.`,
            );

            return true;
        }

        if (action === 'security_kick') {
            if (
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.KickMembers,
                )
            ) {
                throw new Error(
                    'You need Kick Members.',
                );
            }

            await member.kick(
                `Fruity Security action by ${interaction.user.tag}`,
            );

            await markHandled(
                interaction,
                `🔨 Kicked by ${interaction.user}.`,
            );

            return true;
        }

        if (action === 'security_ban') {
            if (
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.BanMembers,
                )
            ) {
                throw new Error(
                    'You need Ban Members.',
                );
            }

            await member.ban({
                reason:
                    `Fruity Security action by ${interaction.user.tag}`,
            });

            await markHandled(
                interaction,
                `⛔ Banned by ${interaction.user}.`,
            );

            return true;
        }

        if (action === 'security_dismiss') {
            await markHandled(
                interaction,
                `✅ Dismissed by ${interaction.user}.`,
            );

            return true;
        }

        return false;
    } catch (error) {
        await interaction.reply({
            content:
                `❌ ${error.message || 'Action failed.'}`,
            ephemeral: true,
        });

        return true;
    }
}

async function markHandled(
    interaction,
    result,
) {
    const embed =
        interaction.message.embeds[0];

    const updatedEmbed =
        embed
            ? {
                ...embed,
                description:
                    `${embed.description || ''}\n\n` +
                    `### ✅ ACTION TAKEN\n${result}`,
            }
            : null;

    await interaction.update({
        embeds: updatedEmbed
            ? [updatedEmbed]
            : interaction.message.embeds,
        components: [],
    });
}
