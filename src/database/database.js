import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : {
            rejectUnauthorized: false,
        },
});

export async function startDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS security_guilds (
            guild_id TEXT PRIMARY KEY,

            enabled BOOLEAN NOT NULL DEFAULT TRUE,

            lockdown BOOLEAN NOT NULL DEFAULT FALSE,

            raid_mode BOOLEAN NOT NULL DEFAULT FALSE,

            log_channel_id TEXT,

            phishing_cases INTEGER NOT NULL DEFAULT 0,
            spam_cases INTEGER NOT NULL DEFAULT 0,
            raid_cases INTEGER NOT NULL DEFAULT 0,
            nuke_cases INTEGER NOT NULL DEFAULT 0,

            total_incidents INTEGER NOT NULL DEFAULT 0,
            threats_blocked INTEGER NOT NULL DEFAULT 0,

            active_incidents INTEGER NOT NULL DEFAULT 0,

            suspicious_accounts INTEGER NOT NULL DEFAULT 0,
            dangerous_roles INTEGER NOT NULL DEFAULT 0,
            dangerous_permissions INTEGER NOT NULL DEFAULT 0,

            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS security_whitelist (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            PRIMARY KEY (guild_id, user_id)
        );
    `);
}

export async function ensureGuild(guildId) {
    await pool.query(
        `
        INSERT INTO security_guilds (
            guild_id,
            log_channel_id
        )
        VALUES ($1, $2)
        ON CONFLICT (guild_id)
        DO NOTHING
        `,
        [
            guildId,
            '1541557303453683792',
        ],
    );
}

export async function getGuildConfig(guildId) {
    await ensureGuild(guildId);

    const result = await pool.query(
        `
        SELECT *
        FROM security_guilds
        WHERE guild_id = $1
        `,
        [guildId],
    );

    return result.rows[0];
}

export async function updateGuildConfig(guildId, updates) {
    await ensureGuild(guildId);

    const allowed = [
        'enabled',
        'lockdown',
        'raid_mode',
        'log_channel_id',
    ];

    const entries = Object.entries(updates)
        .filter(([key]) => allowed.includes(key));

    if (!entries.length) {
        return getGuildConfig(guildId);
    }

    const values = [];
    const sets = [];

    entries.forEach(([key, value], index) => {
        values.push(value);
        sets.push(`${key} = $${index + 1}`);
    });

    values.push(guildId);

    await pool.query(
        `
        UPDATE security_guilds
        SET
            ${sets.join(', ')},
            updated_at = NOW()
        WHERE guild_id = $${values.length}
        `,
        values,
    );

    return getGuildConfig(guildId);
}

export async function incrementCase(guildId, type) {
    await ensureGuild(guildId);

    const columnMap = {
        phishing: 'phishing_cases',
        spam: 'spam_cases',
        raid: 'raid_cases',
        nuke: 'nuke_cases',
    };

    const column = columnMap[type];

    if (!column) {
        throw new Error(`Unknown security case type: ${type}`);
    }

    await pool.query(
        `
        UPDATE security_guilds
        SET
            ${column} = ${column} + 1,
            total_incidents = total_incidents + 1,
            threats_blocked = threats_blocked + 1,
            updated_at = NOW()
        WHERE guild_id = $1
        `,
        [guildId],
    );
}

export async function addSuspiciousAccount(guildId) {
    await ensureGuild(guildId);

    await pool.query(
        `
        UPDATE security_guilds
        SET suspicious_accounts = suspicious_accounts + 1,
            updated_at = NOW()
        WHERE guild_id = $1
        `,
        [guildId],
    );
}

export async function getStats(guildId) {
    return getGuildConfig(guildId);
}

export async function addWhitelist(guildId, userId) {
    await pool.query(
        `
        INSERT INTO security_whitelist (
            guild_id,
            user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [guildId, userId],
    );
}

export async function removeWhitelist(guildId, userId) {
    await pool.query(
        `
        DELETE FROM security_whitelist
        WHERE guild_id = $1
        AND user_id = $2
        `,
        [guildId, userId],
    );
}

export async function isWhitelisted(guildId, userId) {
    const result = await pool.query(
        `
        SELECT 1
        FROM security_whitelist
        WHERE guild_id = $1
        AND user_id = $2
        `,
        [guildId, userId],
    );

    return result.rowCount > 0;
}

export async function getWhitelist(guildId) {
    const result = await pool.query(
        `
        SELECT user_id
        FROM security_whitelist
        WHERE guild_id = $1
        ORDER BY created_at ASC
        `,
        [guildId],
    );

    return result.rows.map((row) => row.user_id);
}
