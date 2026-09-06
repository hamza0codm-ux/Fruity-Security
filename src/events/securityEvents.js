import {
    AuditLogEvent,
} from 'discord.js';

import {
    handleMessage,
    handleMemberJoin,
    handleNukeAction,
} from '../security/securityService.js';

const NUKE_EVENTS = new Set([
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.ChannelCreate,
    AuditLogEvent.RoleDelete,
    AuditLogEvent.RoleCreate,
    AuditLogEvent.WebhookDelete,
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.MemberBanAdd,
]);

export function registerSecurityEvents(client) {
    client.on('messageCreate', async (message) => {
        try {
            await handleMessage(message);
        } catch (error) {
            console.error(
                'Security message handler error:',
                error,
            );
        }
    });

    client.on('guildMemberAdd', async (member) => {
        try {
            await handleMemberJoin(member);
        } catch (error) {
            console.error(
                'Security join handler error:',
                error,
            );
        }
    });

    client.on(
        'guildAuditLogEntryCreate',
        async (entry, guild) => {
            try {
                if (
                    !NUKE_EVENTS.has(entry.action)
                ) {
                    return;
                }

                if (!entry.executorId) {
                    return;
                }

                let action = 'Unknown';

                switch (entry.action) {
                    case AuditLogEvent.ChannelDelete:
                        action = 'Channel deleted';
                        break;

                    case AuditLogEvent.ChannelCreate:
                        action = 'Channel created';
                        break;

                    case AuditLogEvent.RoleDelete:
                        action = 'Role deleted';
                        break;

                    case AuditLogEvent.RoleCreate:
                        action = 'Role created';
                        break;

                    case AuditLogEvent.WebhookDelete:
                        action = 'Webhook deleted';
                        break;

                    case AuditLogEvent.WebhookCreate:
                        action = 'Webhook created';
                        break;

                    case AuditLogEvent.MemberBanAdd:
                        action = 'Member banned';
                        break;
                }

                await handleNukeAction({
                    guild,
                    userId: entry.executorId,
                    action,
                    target:
                        entry.target?.name ||
                        entry.target?.id ||
                        'Unknown',
                });
            } catch (error) {
                console.error(
                    'Anti-nuke handler error:',
                    error,
                );
            }
        },
    );
}
