import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
// override: true is crucial because a shell variable DATABASE_URL exists
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

console.log('Environment configured. DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 10));
