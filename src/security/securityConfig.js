export const SECURITY_CONFIG = {
    logChannelId: '1541557303453683792',

    spam: {
        messageLimit: 6,
        messageWindowMs: 5_000,

        identicalLimit: 3,
        identicalWindowMs: 10_000,

        mentionLimit: 8,

        timeoutMs: 10 * 60 * 1000,

        incidentCooldownMs: 30_000,
    },

    phishing: {
        timeoutMs: 10 * 60 * 1000,

        incidentCooldownMs: 30_000,
    },

    raid: {
        joinLimit: 8,
        joinWindowMs: 10_000,

        suspiciousAccountAgeDays: 7,
    },

    antiNuke: {
        actionLimit: 3,
        actionWindowMs: 10_000,

        timeoutMs: 30 * 60 * 1000,
    },

    lockdown: {
        timeoutMs: 10 * 60 * 1000,
    },
};
