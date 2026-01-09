import './config.js';
import express from 'express';
import cors from 'cors';
import agentRoutes from './routes/agentRoutes.js';
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
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    } else {
        console.log('[Server] ℹ️  Trading engine ready (manual start required)');
        console.log('[Server] 💡 Start engine: POST /engine/start');
    }
});
