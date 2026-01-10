import './config.js';
import { prisma } from './db.js';
// Verify database connection on startup
const dbUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'not configured';
const maskedUrl = dbUrl.replace(/:[^:]*@/, ':****@'); // Mask credentials
console.log('🗄️  Database configuration:');
console.log('   URL:', maskedUrl);
console.log('   Has auth token:', !!process.env.TURSO_AUTH_TOKEN);
// Test database connection
async function testDatabaseConnection() {
    try {
        await prisma.$connect();
        console.log('✅ Successfully connected to Turso database');
        const userCount = await prisma.user.count();
        const agentCount = await prisma.agent.count();
        console.log(`📊 Database stats: ${userCount} users, ${agentCount} agents`);
    }
    catch (error) {
        console.error('❌ CRITICAL: Failed to connect to database!');
        console.error('   Error:', error);
        process.exit(1); // Exit if database is not accessible
    }
}
testDatabaseConnection();
import express from 'express';
import cors from 'cors';
import agentRoutes from './routes/agentRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { Router } from 'express';
import { encrypt, decrypt } from './utils/encryption.js';
import { TradingEngine } from './services/engine.js';
const app = express();
const PORT = process.env.PORT || 3001;
// Initialize Trading Engine
const tradingEngine = new TradingEngine();
// CORS Configuration - Allow all origins for development
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
// Middleware
app.use(express.json());
// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, req.body);
    next();
});
// Routes
app.use('/agent', agentRoutes);
app.use('/user', userRoutes);
// Test endpoint for debugging Railway deployment
app.get('/test', async (req, res) => {
    try {
        console.log('[Test] Endpoint hit');
        const tests = {
            server: 'OK',
            timestamp: new Date().toISOString(),
            env: {
                NODE_ENV: process.env.NODE_ENV,
                hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
                hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
                hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
            }
        };
        // Test Prisma
        try {
            await prisma.$connect();
            tests.database = 'Connected';
            const userCount = await prisma.user.count();
            tests.userCount = userCount;
        }
        catch (e) {
            tests.database = 'Failed: ' + (e instanceof Error ? e.message : String(e));
        }
        // Test encryption
        try {
            const testEncrypt = encrypt('test');
            const testDecrypt = decrypt(testEncrypt);
            tests.encryption = testDecrypt === 'test' ? 'OK' : 'Failed';
        }
        catch (e) {
            tests.encryption = 'Failed: ' + (e instanceof Error ? e.message : String(e));
        }
        res.json(tests);
    }
    catch (error) {
        console.error('[Test] Error:', error);
        res.status(500).json({ error: String(error) });
    }
});
// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'HyperWorld Backend is running',
        engine: tradingEngine.getStatus()
    });
});
// Trading Engine Control Routes
app.post('/engine/start', (req, res) => {
    tradingEngine.start();
    res.json({ success: true, message: 'Trading engine started' });
});
app.post('/engine/stop', (req, res) => {
    tradingEngine.stop();
    res.json({ success: true, message: 'Trading engine stopped' });
});
app.get('/engine/status', (req, res) => {
    res.json(tradingEngine.getStatus());
});
// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});
// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    // Auto-start trading engine in production
    if (process.env.NODE_ENV === 'production') {
        console.log('[Server] 🚀 Auto-starting trading engine...');
        tradingEngine.start();
    }
    else {
        console.log('[Server] ℹ️  Trading engine ready (manual start required)');
        console.log('[Server] 💡 Start engine: POST /engine/start');
    }
});
//# sourceMappingURL=index.js.map