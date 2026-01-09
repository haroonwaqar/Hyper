import '../config.js';
import { createClient } from '@libsql/client';
import { execSync } from 'child_process';
async function main() {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoAuth = process.env.TURSO_AUTH_TOKEN;
    if (!tursoUrl || !tursoUrl.startsWith('libsql://')) {
        console.error('Error: TURSO_DATABASE_URL must be set and start with libsql://');
        process.exit(1);
    }
    console.log('Generating SQL migration from Prisma schema...');
    // Generate SQL DDL
    const sqlContent = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script').toString();
    if (!sqlContent) {
        console.log('No SQL generated.');
        return;
    }
    console.log('Applying SQL to Turso...');
    const client = createClient({
        url: tursoUrl,
        authToken: tursoAuth,
    });
    // Split by semicolon to execute mostly correctly, though naive. 
    // LibSQL executeMultiple matches this need better.
    try {
        await client.executeMultiple(sqlContent);
        console.log('Schema successfully synced to Turso!');
    }
    catch (e) {
        console.error('Error applying schema:', e);
        process.exit(1);
    }
    finally {
        client.close();
    }
}
main();
//# sourceMappingURL=syncTurso.js.map