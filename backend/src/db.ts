import './config.js';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    console.error('ERROR: TURSO_DATABASE_URL is not defined.');
}

const libsql = createClient({
    url: url || 'file:./dev.db',
    authToken
});

const adapter = new PrismaLibSQL(libsql);

export const prisma = new PrismaClient({ adapter });
