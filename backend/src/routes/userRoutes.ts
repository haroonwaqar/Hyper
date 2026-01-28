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

        // walletAddress can be either:
        // - the user's World App wallet (worldWalletAddress), OR
        // - the agent's wallet (agent.walletAddress)
        const agent = await prisma.agent.findFirst({
            where: {
                OR: [
                    { walletAddress },
                    {
                        user: {
                            worldWalletAddress: walletAddress,
                        },
                    },
                ],
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

        // Fetch BOTH perp + spot states (Hyperliquid splits these pockets).
        const [clearinghouse, spot, openOrders, spotMetaCtx] = await Promise.all([
            infoClient.clearinghouseState({ user: agent.walletAddress }),
            infoClient.spotClearinghouseState({ user: agent.walletAddress }),
            infoClient.openOrders({ user: agent.walletAddress }),
            infoClient.spotMetaAndAssetCtxs(),
        ]);

        // Build spot price map (by coin)
        const [, spotAssetCtxs] = spotMetaCtx;
        const spotPxByCoin = new Map<string, number>();
        for (const ctx of spotAssetCtxs as any[]) {
            const coin = String(ctx?.coin ?? '').toUpperCase();
            const px = parseFloat(String(ctx?.midPx ?? ctx?.markPx ?? '0'));
            if (coin && Number.isFinite(px) && px > 0) spotPxByCoin.set(coin, px);
        }

        // PERP positions (legacy / should be 0 under halal mode)
        const assetPositions = clearinghouse.assetPositions || [];
        let perpPositionValue = 0;
        let perpUnrealizedPnl = 0;

        const perpPositions = assetPositions.map((pos: any) => {
            const pnl = parseFloat(pos.position.unrealizedPnl || '0');
            const value = parseFloat(pos.position.positionValue || '0');

            perpPositionValue += value;
            perpUnrealizedPnl += pnl;

            return {
                type: 'PERP',
                coin: pos.position.coin,
                side: parseFloat(pos.position.szi) > 0 ? 'LONG' : 'SHORT',
                size: Math.abs(parseFloat(pos.position.szi)),
                entryPrice: parseFloat(pos.position.entryPx),
                markPrice: parseFloat(pos.position.markPx || pos.position.entryPx),
                unrealizedPnl: pnl,
                marginUsed: parseFloat(pos.position.marginUsed || '0'),
            };
        });

        // SPOT balances (what the halal bot trades)
        const balances = (spot as any)?.balances || [];
        const spotUsdc = balances.find((b: any) => String(b.coin).toUpperCase() === 'USDC');
        const spotUsdcTotal = spotUsdc ? parseFloat(spotUsdc.total || '0') : 0;
        const spotUsdcHold = spotUsdc ? parseFloat(spotUsdc.hold || '0') : 0;
        const spotUsdcAvailable = Math.max(0, spotUsdcTotal - spotUsdcHold);

        let spotNonUsdcValue = 0;
        let spotUnrealizedPnl = 0;
        const spotPositions = balances
            .filter((b: any) => String(b.coin).toUpperCase() !== 'USDC')
            .map((b: any) => {
                const coin = String(b.coin).toUpperCase();
                const total = parseFloat(b.total || '0');
                const hold = parseFloat(b.hold || '0');
                const available = Math.max(0, total - hold);
                const entryNtl = parseFloat(b.entryNtl || '0'); // USDC cost basis
                const px = spotPxByCoin.get(coin) ?? 0;
                const value = total * px;
                const pnl = value - entryNtl;
                if (Number.isFinite(value)) spotNonUsdcValue += value;
                if (Number.isFinite(pnl)) spotUnrealizedPnl += pnl;

                return {
                    type: 'SPOT',
                    coin,
                    side: 'HOLD',
                    size: total,
                    available,
                    entryNotional: entryNtl,
                    markPrice: px,
                    unrealizedPnl: pnl,
                    positionValue: value,
                };
            })
            .filter((p: any) => Number.isFinite(p.size) && p.size > 0);

        // PERP account value
        const marginSummary = clearinghouse.marginSummary;
        const perpAccountValue = parseFloat(marginSummary.accountValue || '0');
        const perpMarginUsed = parseFloat(marginSummary.totalMarginUsed || '0');

        // Total portfolio value (perp pocket + spot pocket)
        const accountValue = perpAccountValue + spotUsdcTotal + spotNonUsdcValue;
        const totalMarginUsed = perpMarginUsed; // spot has no margin
        const totalUnrealizedPnl = perpUnrealizedPnl + spotUnrealizedPnl;
        const totalPositionValue = perpPositionValue + spotNonUsdcValue;

        const positions = [...perpPositions, ...spotPositions];

        res.json({
            success: true,
            hasAgent: true,
            portfolio: {
                accountValue,
                totalMarginUsed,
                availableBalance: Math.max(0, (perpAccountValue - perpMarginUsed)) + spotUsdcAvailable,
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
