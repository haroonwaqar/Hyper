import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY; // Can be 32 chars or 64 hex chars
const IV_LENGTH = 16; // AES block size

if (!ENCRYPTION_KEY_RAW) {
    throw new Error('ENCRYPTION_KEY is not defined in .env');
}

// Support both 32-char raw key and 64-char hex key
let ENCRYPTION_KEY: Buffer;
if (ENCRYPTION_KEY_RAW.length === 64) {
    // Assume hex-encoded 32-byte key
    ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_RAW, 'hex');
} else if (ENCRYPTION_KEY_RAW.length === 32) {
    ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_RAW);
} else {
    throw new Error(`ENCRYPTION_KEY must be 32 characters or 64 hex characters, got ${ENCRYPTION_KEY_RAW.length}`);
}

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
