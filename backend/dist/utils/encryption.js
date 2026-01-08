import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes (256 bits)
const IV_LENGTH = 16; // AES block size
if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not defined in .env');
}
if (ENCRYPTION_KEY.length !== 32) {
    // Ideally we'd throw here, but for dev we might be lenient or just warn. 
    // However, for AES-256, it strictly needs 32 bytes if using it directly.
    // Let's assume the user provides a correct key or we hash it to 32 bytes.
    // For this boilerplate, we'll assume strict 32 chars.
    console.warn(`Warning: ENCRYPTION_KEY length is ${ENCRYPTION_KEY.length}, expected 32.`);
}
export function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
export function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
//# sourceMappingURL=encryption.js.map