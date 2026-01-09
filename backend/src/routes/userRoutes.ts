import { Router } from 'express';
import type { Request, Response } from 'express';
import { InfoClient, HttpTransport } from '@nktkas/hyperliquid';
import { prisma } from '../db.js';

const router = Router();
const transport = new HttpTransport();
const infoClient = new InfoClient({ transport });

// GET /user/portfolio - Real-time portfolio data
router.get('/portfolio', async (req: Request, res: Response): Promise<void> => {
    try {
        const { walletAddress } = req.query;

        if (!walletAddress || typeof walletAddress !== 'string') {
            res.status(400).json({ error: 'walletAddress is required' });
            return;
        }

        console.log('[Portfolio] Fetching data for:', walletAddress);

        // Find user's agent
        const agent = await prisma.agent.findFirst({
            where: {
                user: {
                    worldWalletAddress: walletAddress,
                },
            },
        });

        if (!agent) {
            res.json({
                success: true,
                hasAgent: false,
                portfolio: null,
            });
            return;
        }

        // Fetch clearinghouse state from Hyperliquid
        const clearinghouse = await infoClient.clearinghouseState({
            user: agent.walletAddress,
        });

        // Fetch open orders
        const openOrders = await infoClient.openOrders({
            user: agent.walletAddress,
        });

        // Calculate total portfolio value
        const assetPositions = clearinghouse.assetPositions || [];
        let totalPositionValue = 0;
        let totalUnrealizedPnl = 0;

        const positions = assetPositions.map((pos: any) => {
            const pnl = parseFloat(pos.position.unrealizedPnl || '0');
            const value = parseFloat(pos.position.positionValue || '0');

            totalPositionValue += value;
            totalUnrealizedPnl += pnl;

            return {
                coin: pos.position.coin,
                side: parseFloat(pos.position.szi) > 0 ? 'LONG' : 'SHORT',
                size: Math.abs(parseFloat(pos.position.szi)),
                entryPrice: parseFloat(pos.position.entryPx),
                markPrice: parseFloat(pos.position.markPx || pos.position.entryPx),
                unrealizedPnl: pnl,
                marginUsed: parseFloat(pos.position.marginUsed || '0'),
            };
        });

        // Get account value
        const marginSummary = clearinghouse.marginSummary;
        const accountValue = parseFloat(marginSummary.accountValue || '0');
        const totalMarginUsed = parseFloat(marginSummary.totalMarginUsed || '0');

        res.json({
            success: true,
            hasAgent: true,
            portfolio: {
                accountValue,
                totalMarginUsed,
                availableBalance: accountValue - totalMarginUsed,
                totalUnrealizedPnl,
                totalPositionValue,
                positions,
                openOrders: openOrders || [],
                lastUpdated: Date.now(),
            },
        });

    } catch (error) {
        console.error('[Portfolio] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch portfolio data',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// GET /user/price-history - Price history for charts
router.get('/price-history', async (req: Request, res: Response): Promise<void> => {
    try {
        const { coin = 'ETH', interval = '1h', limit = 100 } = req.query;

        console.log('[PriceHistory] Fetching for:', coin);

        type ValidInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

        // Fetch candle data from Hyperliquid
        const candles = await infoClient.candleSnapshot({
            coin: coin as string,
            interval: (interval as string) as ValidInterval,
            startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
        });

        const formattedCandles = candles.map((c: any) => ({
            timestamp: c.t,
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
            volume: parseFloat(c.v),
        }));

        res.json({
            success: true,
            coin,
            interval,
            candles: formattedCandles.slice(-Number(limit)),
        });

    } catch (error) {
        console.error('[PriceHistory] Error:', error);
        res.status(500).json({
            error: 'Failed to fetch price history',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
