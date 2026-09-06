import pg from 'pg';

const {
    Pool,
} = pg;


/*
|--------------------------------------------------------------------------
| PostgreSQL
|--------------------------------------------------------------------------
*/

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : {
            rejectUnauthorized: false,
        },
});


/*
|--------------------------------------------------------------------------
| Database Startup
|--------------------------------------------------------------------------
*/

export async function startDatabase() {
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS security_guilds (
                guild_id TEXT PRIMARY KEY,

                enabled BOOLEAN NOT NULL DEFAULT TRUE,

                lockdown BOOLEAN NOT NULL DEFAULT FALSE,

                raid_mode BOOLEAN NOT NULL DEFAULT FALSE,

                log_channel_id TEXT NOT NULL DEFAULT '1541557303453683792',

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


        await client.query(`
            CREATE TABLE IF NOT EXISTS security_whitelist (
                guild_id TEXT NOT NULL,

                user_id TEXT NOT NULL,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    user_id
                )
            );
        `);


        /*
        |--------------------------------------------------------------------------
        | Security Cases
        |--------------------------------------------------------------------------
        |
        | One row per security incident.
        |
        */

        await client.query(`
            CREATE TABLE IF NOT EXISTS security_cases (
                case_number BIGSERIAL PRIMARY KEY,

                guild_id TEXT NOT NULL,

                user_id TEXT NOT NULL,

                type TEXT NOT NULL,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);


        /*
        |--------------------------------------------------------------------------
        | User Security Flags
        |--------------------------------------------------------------------------
        |
        | Permanent per-user security flag counter.
        |
        */

        await client.query(`
            CREATE TABLE IF NOT EXISTS security_user_flags (
                guild_id TEXT NOT NULL,

                user_id TEXT NOT NULL,

                flag_count INTEGER NOT NULL DEFAULT 0,

                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                PRIMARY KEY (
                    guild_id,
                    user_id
                )
            );
        `);


        /*
        |--------------------------------------------------------------------------
        | Existing Database Upgrade
        |--------------------------------------------------------------------------
        |
        | Makes sure older Security databases receive the new columns.
        |
        */

        await client.query(`
            ALTER TABLE security_guilds
            ADD COLUMN IF NOT EXISTS active_incidents INTEGER NOT NULL DEFAULT 0;
        `);

        await client.query(`
            ALTER TABLE security_guilds
            ADD COLUMN IF NOT EXISTS dangerous_roles INTEGER NOT NULL DEFAULT 0;
        `);

        await client.query(`
            ALTER TABLE security_guilds
            ADD COLUMN IF NOT EXISTS dangerous_permissions INTEGER NOT NULL DEFAULT 0;
        `);


        console.log('✅ Security database tables ready.');

    } finally {
        client.release();
    }
}


/*
|--------------------------------------------------------------------------
| Ensure Guild
|--------------------------------------------------------------------------
*/

export async function ensureGuild(guildId) {
    const result = await pool.query(
        `
        INSERT INTO security_guilds (
            guild_id
        )
        VALUES ($1)

        ON CONFLICT (guild_id)
        DO NOTHING

        RETURNING *;
        `,
        [
            guildId,
        ],
    );

    if (result.rows[0]) {
        return result.rows[0];
    }

    const existing = await pool.query(
        `
        SELECT *
        FROM security_guilds
        WHERE guild_id = $1;
        `,
        [
            guildId,
        ],
    );

    return existing.rows[0] || null;
}


/*
|--------------------------------------------------------------------------
| Guild Config
|--------------------------------------------------------------------------
*/

export async function getGuildConfig(guildId) {
    await ensureGuild(guildId);

    const result = await pool.query(
        `
        SELECT *
        FROM security_guilds
        WHERE guild_id = $1;
        `,
        [
            guildId,
        ],
    );

    return result.rows[0] || null;
}


export async function updateGuildConfig(
    guildId,
    updates,
) {
    await ensureGuild(guildId);

    const allowed = new Set([
        'enabled',
        'lockdown',
        'raid_mode',
        'log_channel_id',
        'phishing_cases',
        'spam_cases',
        'raid_cases',
        'nuke_cases',
        'total_incidents',
        'threats_blocked',
        'active_incidents',
        'suspicious_accounts',
        'dangerous_roles',
        'dangerous_permissions',
    ]);

    const entries = Object.entries(updates)
        .filter(([key]) =>
            allowed.has(key),
        );

    if (!entries.length) {
        return getGuildConfig(guildId);
    }

    const values = [
        guildId,
    ];

    const assignments = [];

    entries.forEach(
        ([key, value], index) => {
            values.push(value);

            assignments.push(
                `"${key}" = $${index + 2}`,
            );
        },
    );

    assignments.push(
        'updated_at = NOW()',
    );

    const result = await pool.query(
        `
        UPDATE security_guilds

        SET
            ${assignments.join(', ')}

        WHERE guild_id = $1

        RETURNING *;
        `,
        values,
    );

    return result.rows[0] || null;
}


/*
|--------------------------------------------------------------------------
| Increment Security Case
|--------------------------------------------------------------------------
|
| Returns:
|
| {
|     caseNumber,
|     userFlagCount
| }
|
*/

export async function incrementCase(
    guildId,
    type,
    userId = null,
) {
    await ensureGuild(guildId);

    const columnMap = {
        phishing: 'phishing_cases',
        spam: 'spam_cases',
        raid: 'raid_cases',
        nuke: 'nuke_cases',
    };

    const column = columnMap[type];

    if (!column) {
        throw new Error(
            `Unknown security case type: ${type}`,
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Guild Statistics
    |--------------------------------------------------------------------------
    */

    const guildResult = await pool.query(
        `
        UPDATE security_guilds

        SET
            "${column}" = "${column}" + 1,
            total_incidents = total_incidents + 1,
            threats_blocked = threats_blocked + 1,
            updated_at = NOW()

        WHERE guild_id = $1

        RETURNING *;
        `,
        [
            guildId,
        ],
    );


    /*
    |--------------------------------------------------------------------------
    | User Case Tracking
    |--------------------------------------------------------------------------
    */

    if (!userId) {
        return {
            caseNumber: null,
            userFlagCount: null,
            guild: guildResult.rows[0] || null,
        };
    }


    /*
    |--------------------------------------------------------------------------
    | Create Permanent Case
    |--------------------------------------------------------------------------
    */

    const caseResult = await pool.query(
        `
        INSERT INTO security_cases (
            guild_id,
            user_id,
            type
        )
        VALUES (
            $1,
            $2,
            $3
        )

        RETURNING case_number;
        `,
        [
            guildId,
            userId,
            type,
        ],
    );


    /*
    |--------------------------------------------------------------------------
    | Increment User Flags
    |--------------------------------------------------------------------------
    */

    const flagResult = await pool.query(
        `
        INSERT INTO security_user_flags (
            guild_id,
            user_id,
            flag_count
        )

        VALUES (
            $1,
            $2,
            1
        )

        ON CONFLICT (
            guild_id,
            user_id
        )

        DO UPDATE SET
            flag_count =
                security_user_flags.flag_count + 1,

            updated_at = NOW()

        RETURNING flag_count;
        `,
        [
            guildId,
            userId,
        ],
    );


    return {
        caseNumber:
            caseResult.rows[0]?.case_number || null,

        userFlagCount:
            flagResult.rows[0]?.flag_count || 1,

        guild:
            guildResult.rows[0] || null,
    };
}


/*
|--------------------------------------------------------------------------
| User Flag Count
|--------------------------------------------------------------------------
*/

export async function getUserFlagCount(
    guildId,
    userId,
) {
    const result = await pool.query(
        `
        SELECT flag_count

        FROM security_user_flags

        WHERE
            guild_id = $1
            AND user_id = $2;
        `,
        [
            guildId,
            userId,
        ],
    );

    return result.rows[0]?.flag_count || 0;
}


/*
|--------------------------------------------------------------------------
| Security Cases For User
|--------------------------------------------------------------------------
*/

export async function getUserSecurityCases(
    guildId,
    userId,
) {
    const result = await pool.query(
        `
        SELECT
            case_number,
            type,
            created_at

        FROM security_cases

        WHERE
            guild_id = $1
            AND user_id = $2

        ORDER BY case_number DESC;
        `,
        [
            guildId,
            userId,
        ],
    );

    return result.rows;
}


/*
|--------------------------------------------------------------------------
| Suspicious Accounts
|--------------------------------------------------------------------------
*/

export async function addSuspiciousAccount(
    guildId,
) {
    await ensureGuild(guildId);

    await pool.query(
        `
        UPDATE security_guilds

        SET
            suspicious_accounts =
                suspicious_accounts + 1,

            updated_at = NOW()

        WHERE guild_id = $1;
        `,
        [
            guildId,
        ],
    );
}


/*
|--------------------------------------------------------------------------
| Statistics
|--------------------------------------------------------------------------
*/

export async function getStats(guildId) {
    await ensureGuild(guildId);

    const result = await pool.query(
        `
        SELECT *
        FROM security_guilds
        WHERE guild_id = $1;
        `,
        [
            guildId,
        ],
    );

    return result.rows[0] || null;
}


/*
|--------------------------------------------------------------------------
| Whitelist
|--------------------------------------------------------------------------
*/

export async function addWhitelist(
    guildId,
    userId,
) {
    await pool.query(
        `
        INSERT INTO security_whitelist (
            guild_id,
            user_id
        )

        VALUES (
            $1,
            $2
        )

        ON CONFLICT (
            guild_id,
            user_id
        )

        DO NOTHING;
        `,
        [
            guildId,
            userId,
        ],
    );
}


export async function removeWhitelist(
    guildId,
    userId,
) {
    await pool.query(
        `
        DELETE FROM security_whitelist

        WHERE
            guild_id = $1
            AND user_id = $2;
        `,
        [
            guildId,
            userId,
        ],
    );
}


export async function isWhitelisted(
    guildId,
    userId,
) {
    const result = await pool.query(
        `
        SELECT 1

        FROM security_whitelist

        WHERE
            guild_id = $1
            AND user_id = $2

        LIMIT 1;
        `,
        [
            guildId,
            userId,
        ],
    );

    return result.rowCount > 0;
}


export async function getWhitelist(
    guildId,
) {
    const result = await pool.query(
        `
        SELECT
            user_id,
            created_at

        FROM security_whitelist

        WHERE guild_id = $1

        ORDER BY created_at ASC;
        `,
        [
            guildId,
        ],
    );

    return result.rows;
}
