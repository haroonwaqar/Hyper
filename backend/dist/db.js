// import './config.js';
// import { PrismaClient } from '@prisma/client';
// import { PrismaLibSQL } from '@prisma/adapter-libsql';
// import { createClient } from '@libsql/client';
// const url = process.env.TURSO_DATABASE_URL!;
// const authToken = process.env.TURSO_AUTH_TOKEN!;
// if (!url) {
//     console.error('ERROR: TURSO_DATABASE_URL is not defined.');
// }
// const libsql = createClient({
//     url: url || 'file:./dev.db',
//     authToken
// });
// const adapter = new PrismaLibSQL(libsql);
// export const prisma = new PrismaClient({ adapter });
import './config.js';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
// SAFETY CHECK:
// If we are in production (Railway) and keys are missing, STOP immediately.
if (process.env.NODE_ENV === 'production') {
    if (!url || !authToken) {
        throw new Error('❌ FATAL: Missing Turso Environment Variables in Production!');
    }
}
const libsql = createClient({
    // Use the env var, OR fallback to local DB only for local development
    url: url || 'file:./dev.db',
    authToken: authToken || '', // Fallback to empty string for local dev if needed
});
const adapter = new PrismaLibSQL(libsql);
export const prisma = new PrismaClient({ adapter });
//# sourceMappingURL=db.js.map