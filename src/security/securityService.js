import {
    PermissionFlagsBits,
} from 'discord.js';

import {
    addSuspiciousAccount,
    getGuildConfig,
    incrementCase,
    isWhitelisted,
    updateGuildConfig,
} from '../database/database.js';

import {
    SECURITY_CONFIG,
} from './securityConfig.js';

import {
    sendAutomaticSecurityLog,
    sendStaffActionLog,
} from './securityLogger.js';


/*
|--------------------------------------------------------------------------
| In-Memory Tracking
|--------------------------------------------------------------------------
*/

const messageHistory = new Map();
const identicalHistory = new Map();
const incidentCooldowns = new Map();
const raidJoins = new Map();
const nukeActions = new Map();


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getKey(
    guildId,
    userId,
) {
    return `${guildId}:${userId}`;
}


function cleanupArray(
    array,
    cutoff,
) {
    return array.filter(
        (timestamp) =>
            timestamp >= cutoff,
    );
}


/*
|--------------------------------------------------------------------------
| Incident Cooldowns
|--------------------------------------------------------------------------
*/

export function isIncidentActive(
    guildId,
    userId,
    type,
) {
    const key =
        `${guildId}:${userId}:${type}`;

    const expires =
        incidentCooldowns.get(key);

    if (!expires) {
        return false;
    }

    if (expires <= Date.now()) {
        incidentCooldowns.delete(key);

        return false;
    }

    return true;
}


export function startIncidentCooldown(
    guildId,
    userId,
    type,
    duration,
) {
    incidentCooldowns.set(
        `${guildId}:${userId}:${type}`,
        Date.now() + duration,
    );
}


/*
|--------------------------------------------------------------------------
| Message Handler
|--------------------------------------------------------------------------
*/

export async function handleMessage(
    message,
) {
    if (!message.guild) {
        return;
    }

    if (message.author.bot) {
        return;
    }

    const config =
        await getGuildConfig(
            message.guild.id,
        );

    if (!config?.enabled) {
        return;
    }

    if (
        await isWhitelisted(
            message.guild.id,
            message.author.id,
        )
    ) {
        return;
    }

    await checkDiscordInvite(
        message,
    );

    await checkPhishing(
        message,
    );

    await checkSpam(
        message,
    );

    await checkIdenticalSpam(
        message,
    );

    await checkMentionSpam(
        message,
    );
}


/*
|--------------------------------------------------------------------------
| Safe Delete
|--------------------------------------------------------------------------
*/

async function safeDelete(
    message,
) {
    try {
        if (message.deletable) {
            await message.delete();
        }
    } catch {
        // Ignore deleted/inaccessible messages.
    }
}


/*
|--------------------------------------------------------------------------
| Safe Timeout
|--------------------------------------------------------------------------
*/

async function safeTimeout(
    member,
    duration,
    reason,
) {
    try {
        if (!member) {
            console.error(
                'Timeout failed: member is missing.',
            );

            return false;
        }

        if (!member.moderatable) {
            console.error(
                `Timeout failed: ${member.user?.tag || member.id} is not moderatable by the bot.`,
            );

            return false;
        }

        await member.timeout(
            duration,
            reason,
        );

        console.log(
            `⏰ Timed out ${member.user?.tag || member.id} for ${duration / 60000} minutes.`,
        );

        return true;

    } catch (error) {
        console.error(
            `Timeout failed for ${member.user?.tag || member.id}:`,
            error,
        );

        return false;
    }
}


/*
|--------------------------------------------------------------------------
| Discord Invite Detection
|--------------------------------------------------------------------------
*/

function hasDiscordInvite(
    content,
) {
    return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]+/i.test(
        content,
    );
}


/*
|--------------------------------------------------------------------------
| Phishing Detection
|--------------------------------------------------------------------------
*/

function hasSuspiciousLink(
    content,
) {
    const urlMatches =
        content.match(
            /https?:\/\/[^\s<]+/gi,
        );

    if (!urlMatches) {
        return false;
    }

    const suspiciousPatterns = [
        'free-nitro',
        'discord-nitro',
        'nitro-gift',
        'steamcommunity-gift',
        'claim-reward',
        'free-gift',
        'verify-account',
        'discord-verification',
        'discord-gift',
        'login-discord',
        'disсord',
    ];

    return urlMatches.some(
        (url) =>
            suspiciousPatterns.some(
                (pattern) =>
                    url
                        .toLowerCase()
                        .includes(pattern),
            ),
    );
}


/*
|--------------------------------------------------------------------------
| Anti Discord Invite
|--------------------------------------------------------------------------
*/

async function checkDiscordInvite(
    message,
) {
    if (
        !hasDiscordInvite(
            message.content,
        )
    ) {
        return;
    }

    const guildId =
        message.guild.id;

    const userId =
        message.author.id;

    if (
        isIncidentActive(
            guildId,
            userId,
            'discord_invite',
        )
    ) {
        await safeDelete(
            message,
        );

        return;
    }

    startIncidentCooldown(
        guildId,
        userId,
        'discord_invite',
        SECURITY_CONFIG.phishing.incidentCooldownMs,
    );

    await safeDelete(
        message,
    );

    const member =
        message.member;

    const timedOut =
        member
            ? await safeTimeout(
                member,
                SECURITY_CONFIG.phishing.timeoutMs,
                'Fruity Security: Discord invite link',
            )
            : false;


    const caseData =
        await incrementCase(
            guildId,
            'phishing',
            userId,
        );


    await sendAutomaticSecurityLog({
        guild: message.guild,

        type: '🔗 Anti-Discord Invite',

        user: message.author,

        reason:
            'Discord invite link detected.',

        details: [
            `Channel: ${message.channel}`,
            'Message deleted: Yes',
        ],

        action: timedOut
            ? `⏰ Automatically timed out for ${SECURITY_CONFIG.phishing.timeoutMs / 60000} minutes.`
            : '⚠️ Could not automatically timeout the user.',

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });
}


/*
|--------------------------------------------------------------------------
| Anti Phishing
|--------------------------------------------------------------------------
*/

async function checkPhishing(
    message,
) {
    if (
        !hasSuspiciousLink(
            message.content,
        )
    ) {
        return;
    }

    const guildId =
        message.guild.id;

    const userId =
        message.author.id;

    if (
        isIncidentActive(
            guildId,
            userId,
            'phishing',
        )
    ) {
        await safeDelete(
            message,
        );

        return;
    }

    startIncidentCooldown(
        guildId,
        userId,
        'phishing',
        SECURITY_CONFIG.phishing.incidentCooldownMs,
    );

    await safeDelete(
        message,
    );

    const timedOut =
        message.member
            ? await safeTimeout(
                message.member,
                SECURITY_CONFIG.phishing.timeoutMs,
                'Fruity Security: Suspicious/phishing link',
            )
            : false;


    const caseData =
        await incrementCase(
            guildId,
            'phishing',
            userId,
        );


    await sendAutomaticSecurityLog({
        guild: message.guild,

        type: '🔗 Anti-Phishing',

        user: message.author,

        reason:
            'Suspicious/phishing link detected.',

        details: [
            `Channel: ${message.channel}`,
            'Message deleted: Yes',
        ],

        action: timedOut
            ? '⏰ User automatically timed out.'
            : '⚠️ Timeout could not be applied.',

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });
}


/*
|--------------------------------------------------------------------------
| Anti Spam
|--------------------------------------------------------------------------
*/

async function checkSpam(
    message,
) {
    const key =
        getKey(
            message.guild.id,
            message.author.id,
        );

    const now =
        Date.now();

    const history =
        messageHistory.get(key) || [];

    const recent =
        cleanupArray(
            history,
            now -
                SECURITY_CONFIG.spam.messageWindowMs,
        );

    recent.push(now);

    messageHistory.set(
        key,
        recent,
    );

    if (
        recent.length <
        SECURITY_CONFIG.spam.messageLimit
    ) {
        return;
    }

    if (
        isIncidentActive(
            message.guild.id,
            message.author.id,
            'spam',
        )
    ) {
        await safeDelete(
            message,
        );

        return;
    }

    startIncidentCooldown(
        message.guild.id,
        message.author.id,
        'spam',
        SECURITY_CONFIG.spam.incidentCooldownMs,
    );

    const messageCount =
        recent.length;

    await safeDelete(
        message,
    );

    const timedOut =
        message.member
            ? await safeTimeout(
                message.member,
                SECURITY_CONFIG.spam.timeoutMs,
                'Fruity Security: Message spam',
            )
            : false;


    const caseData =
        await incrementCase(
            message.guild.id,
            'spam',
            message.author.id,
        );


    await sendAutomaticSecurityLog({
        guild: message.guild,

        type: '💬 Anti-Spam',

        user: message.author,

        reason:
            'Message spam detected.',

        details: [
            `${messageCount} messages detected in 5 seconds.`,
            `Limit: ${SECURITY_CONFIG.spam.messageLimit} messages / 5 seconds.`,
            `Channel: ${message.channel}`,
            'Spam messages deleted.',
        ],

        action: timedOut
            ? `⏰ Automatically timed out for ${SECURITY_CONFIG.spam.timeoutMs / 60000} minutes.`
            : '⚠️ Timeout could not be applied.',

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });


    messageHistory.delete(
        key,
    );
}


/*
|--------------------------------------------------------------------------
| Identical Spam
|--------------------------------------------------------------------------
*/

async function checkIdenticalSpam(
    message,
) {
    const key =
        getKey(
            message.guild.id,
            message.author.id,
        );

    const content =
        message.content
            .trim()
            .toLowerCase();

    if (!content) {
        return;
    }

    const now =
        Date.now();

    const history =
        identicalHistory.get(key) || [];

    const recent =
        history.filter(
            (entry) =>
                entry.timestamp >=
                now -
                    SECURITY_CONFIG.spam.identicalWindowMs,
        );

    recent.push({
        content,
        timestamp: now,
    });

    identicalHistory.set(
        key,
        recent,
    );

    const identicalCount =
        recent.filter(
            (entry) =>
                entry.content === content,
        ).length;

    if (
        identicalCount <
        SECURITY_CONFIG.spam.identicalLimit
    ) {
        return;
    }

    if (
        isIncidentActive(
            message.guild.id,
            message.author.id,
            'identical_spam',
        )
    ) {
        await safeDelete(
            message,
        );

        return;
    }

    startIncidentCooldown(
        message.guild.id,
        message.author.id,
        'identical_spam',
        SECURITY_CONFIG.spam.incidentCooldownMs,
    );

    await safeDelete(
        message,
    );

    const timedOut =
        message.member
            ? await safeTimeout(
                message.member,
                SECURITY_CONFIG.spam.timeoutMs,
                'Fruity Security: Repeated identical messages',
            )
            : false;


    const caseData =
        await incrementCase(
            message.guild.id,
            'spam',
            message.author.id,
        );


    await sendAutomaticSecurityLog({
        guild: message.guild,

        type: '💬 Anti-Spam',

        user: message.author,

        reason:
            'Repeated identical messages detected.',

        details: [
            `${identicalCount} identical messages in 10 seconds.`,
            `Limit: ${SECURITY_CONFIG.spam.identicalLimit} identical messages / 10 seconds.`,
            `Channel: ${message.channel}`,
        ],

        action: timedOut
            ? '⏰ Automatically timed out.'
            : '⚠️ Timeout could not be applied.',

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });


    identicalHistory.delete(
        key,
    );
}


/*
|--------------------------------------------------------------------------
| Mention Spam
|--------------------------------------------------------------------------
*/

async function checkMentionSpam(
    message,
) {
    const mentionCount =
        message.mentions.users.size +
        message.mentions.roles.size;

    if (
        mentionCount <
        SECURITY_CONFIG.spam.mentionLimit
    ) {
        return;
    }

    if (
        isIncidentActive(
            message.guild.id,
            message.author.id,
            'mention_spam',
        )
    ) {
        await safeDelete(
            message,
        );

        return;
    }

    startIncidentCooldown(
        message.guild.id,
        message.author.id,
        'mention_spam',
        SECURITY_CONFIG.spam.incidentCooldownMs,
    );

    await safeDelete(
        message,
    );

    const timedOut =
        message.member
            ? await safeTimeout(
                message.member,
                SECURITY_CONFIG.spam.timeoutMs,
                'Fruity Security: Mention spam',
            )
            : false;


    const caseData =
        await incrementCase(
            message.guild.id,
            'spam',
            message.author.id,
        );


    await sendAutomaticSecurityLog({
        guild: message.guild,

        type: '💬 Anti-Mention Spam',

        user: message.author,

        reason:
            'Excessive mentions detected.',

        details: [
            `${mentionCount} mentions in one message.`,
            `Limit: ${SECURITY_CONFIG.spam.mentionLimit}+ mentions.`,
            `Channel: ${message.channel}`,
        ],

        action: timedOut
            ? '⏰ Automatically timed out.'
            : '⚠️ Timeout could not be applied.',

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });
}


/*
|--------------------------------------------------------------------------
| Anti Raid
|--------------------------------------------------------------------------
*/

export async function handleMemberJoin(
    member,
) {
    if (!member.guild) {
        return;
    }

    const config =
        await getGuildConfig(
            member.guild.id,
        );

    if (!config?.enabled) {
        return;
    }

    if (
        await isWhitelisted(
            member.guild.id,
            member.id,
        )
    ) {
        return;
    }

    const guildId =
        member.guild.id;

    const now =
        Date.now();

    const joins =
        raidJoins.get(guildId) || [];

    const recent =
        joins.filter(
            (timestamp) =>
                timestamp >=
                now -
                    SECURITY_CONFIG.raid.joinWindowMs,
        );

    recent.push(now);

    raidJoins.set(
        guildId,
        recent,
    );

    const accountAge =
        now -
        member.user.createdTimestamp;

    const accountAgeDays =
        accountAge /
        (24 * 60 * 60 * 1000);

    const suspicious =
        accountAgeDays <
        SECURITY_CONFIG.raid.suspiciousAccountAgeDays;

    if (suspicious) {
        await addSuspiciousAccount(
            guildId,
        );
    }

    if (
        recent.length >=
        SECURITY_CONFIG.raid.joinLimit
    ) {
        if (!config.raid_mode) {

            await updateGuildConfig(
                guildId,
                {
                    raid_mode: true,
                },
            );


            const caseData =
                await incrementCase(
                    guildId,
                    'raid',
                    member.id,
                );


            await sendStaffActionLog({
                guild: member.guild,

                type: '🚨 Anti-Raid',

                user: member.user,

                reason:
                    'Possible raid detected.',

                details: [
                    `${recent.length} joins within 10 seconds.`,
                    `Raid threshold: ${SECURITY_CONFIG.raid.joinLimit} joins / 10 seconds.`,
                    suspicious
                        ? `Account is younger than ${SECURITY_CONFIG.raid.suspiciousAccountAgeDays} days.`
                        : 'Account age appears normal.',
                ],

                caseNumber:
                    caseData.caseNumber,

                userFlagCount:
                    caseData.userFlagCount,
            });
        }
    }

    if (
        config.raid_mode &&
        suspicious
    ) {
        await safeTimeout(
            member,
            SECURITY_CONFIG.lockdown.timeoutMs,
            'Fruity Security: Suspicious account during raid mode',
        );
    }
}


/*
|--------------------------------------------------------------------------
| Anti Nuke
|--------------------------------------------------------------------------
*/

export async function handleNukeAction({
    guild,
    userId,
    action,
    target,
}) {
    if (!guild) {
        return;
    }

    if (
        await isWhitelisted(
            guild.id,
            userId,
        )
    ) {
        return;
    }

    const key =
        getKey(
            guild.id,
            userId,
        );

    const now =
        Date.now();

    const history =
        nukeActions.get(key) || [];

    const recent =
        history.filter(
            (entry) =>
                entry.timestamp >=
                now -
                    SECURITY_CONFIG.antiNuke.actionWindowMs,
        );

    recent.push({
        action,
        target,
        timestamp: now,
    });

    nukeActions.set(
        key,
        recent,
    );

    if (
        recent.length <
        SECURITY_CONFIG.antiNuke.actionLimit
    ) {
        return;
    }

    if (
        isIncidentActive(
            guild.id,
            userId,
            'nuke',
        )
    ) {
        return;
    }

    startIncidentCooldown(
        guild.id,
        userId,
        'nuke',
        60_000,
    );


    const member =
        await guild.members
            .fetch(userId)
            .catch(() => null);


    let removedRoles = 0;

    let timedOut = false;


    if (member) {

        for (
            const role
            of member.roles.cache.values()
        ) {
            if (
                role.id === guild.id
            ) {
                continue;
            }

            if (
                role.managed
            ) {
                continue;
            }

            try {
                await member.roles.remove(
                    role,
                    'Fruity Security: Anti-Nuke protection',
                );

                removedRoles++;

            } catch {
                // Continue removing other roles.
            }
        }


        timedOut =
            await safeTimeout(
                member,
                SECURITY_CONFIG.antiNuke.timeoutMs,
                'Fruity Security: Anti-Nuke protection',
            );
    }


    const caseData =
        await incrementCase(
            guild.id,
            'nuke',
            userId,
        );


    await sendAutomaticSecurityLog({
        guild,

        type: '☢️ Anti-Nuke',

        user:
            member?.user || {
                id: userId,

                toString: () =>
                    `<@${userId}>`,
            },

        reason:
            'Dangerous server activity detected.',

        details: [
            `${recent.length} dangerous actions within 10 seconds.`,
            `Latest action: ${action}`,
            `Target: ${target || 'Unknown'}`,
            `Dangerous roles removed: ${removedRoles}`,
        ],

        action:
            `${timedOut ? '⏰ User timed out.' : '⚠️ Timeout failed.'}\n` +
            `🛡️ ${removedRoles} dangerous roles removed.`,

        caseNumber:
            caseData.caseNumber,

        userFlagCount:
            caseData.userFlagCount,
    });


    nukeActions.delete(
        key,
    );
}


/*
|--------------------------------------------------------------------------
| Lockdown
|--------------------------------------------------------------------------
*/

export async function lockdownGuild(
    guild,
) {
    await updateGuildConfig(
        guild.id,
        {
            lockdown: true,
        },
    );

    let changed = 0;

    for (
        const channel
        of guild.channels.cache.values()
    ) {
        try {
            if (
                channel.isTextBased() &&
                channel.permissionsFor(
                    guild.roles.everyone,
                )?.has(
                    PermissionFlagsBits.SendMessages,
                )
            ) {
                await channel.permissionOverwrites.edit(
                    guild.roles.everyone,
                    {
                        SendMessages: false,
                    },
                    {
                        reason:
                            'Fruity Security lockdown',
                    },
                );

                changed++;
            }

        } catch {
            // Ignore channels the bot cannot modify.
        }
    }

    return changed;
}


/*
|--------------------------------------------------------------------------
| Unlock
|--------------------------------------------------------------------------
*/

export async function unlockGuild(
    guild,
) {
    await updateGuildConfig(
        guild.id,
        {
            lockdown: false,
        },
    );

    let changed = 0;

    for (
        const channel
        of guild.channels.cache.values()
    ) {
        try {
            if (
                channel.isTextBased()
            ) {
                await channel.permissionOverwrites.edit(
                    guild.roles.everyone,
                    {
                        SendMessages: null,
                    },
                    {
                        reason:
                            'Fruity Security lockdown removed',
                    },
                );

                changed++;
            }

        } catch {
            // Ignore channels the bot cannot modify.
        }
    }

    return changed;
}


/*
|--------------------------------------------------------------------------
| Security Scan
|--------------------------------------------------------------------------
*/

export async function scanGuild(
    guild,
) {
    const problems = [];

    let dangerousRoles = 0;

    let dangerousPermissions = 0;

    let bots = 0;


    for (
        const role
        of guild.roles.cache.values()
    ) {
        if (
            role.id === guild.id ||
            role.managed
        ) {
            continue;
        }

        if (
            role.permissions.has(
                PermissionFlagsBits.Administrator,
            ) ||
            role.permissions.has(
                PermissionFlagsBits.ManageGuild,
            ) ||
            role.permissions.has(
                PermissionFlagsBits.ManageRoles,
            ) ||
            role.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            dangerousRoles++;

            problems.push(
                `Dangerous role: ${role.name}`,
            );
        }
    }


    for (
        const role
        of guild.roles.cache.values()
    ) {
        if (
            role.permissions.has(
                PermissionFlagsBits.Administrator,
            )
        ) {
            dangerousPermissions++;

            problems.push(
                `Administrator permission: ${role.name}`,
            );
        }
    }


    const members =
        await guild.members.fetch();


    for (
        const member
        of members.values()
    ) {
        if (member.user.bot) {
            bots++;
        }
    }


    return {
        rolesChecked:
            guild.roles.cache.size,

        dangerousRoles,

        dangerousPermissions,

        bots,

        membersChecked:
            members.size,

        problems,
    };
}
