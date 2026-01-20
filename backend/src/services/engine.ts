// Trading Engine for HyperWorld
// Implements funding rate arbitrage strategy for "Safe" agents

import { prisma } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import { ethers } from 'ethers';
import { InfoClient, ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';

export class TradingEngine {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private infoClient: InfoClient;
    private readonly FUNDING_THRESHOLD = 0; // Always trade when balance is sufficient
    private readonly MIN_BALANCE = 5; // 5 USDC minimum
    private readonly LOOP_INTERVAL = 60000; // 60 seconds

    constructor() {
        const transport = new HttpTransport();
        this.infoClient = new InfoClient({ transport });
    }

    /**
     * Start the trading engine
     */
    start() {
        if (this.isRunning) {
            console.log('[Engine] ⚠️  Already running');
            return;
        }

        console.log('[Engine] 🚀 Starting Trading Engine...');
        console.log('[Engine] 📊 Strategy: Funding Rate Arbitrage');
        console.log('[Engine] ⏱️  Loop Interval: 60 seconds');

        this.isRunning = true;

        // Run immediately on start
        this.executeLoop();

        // Then run every 60 seconds
        this.intervalId = setInterval(() => {
            this.executeLoop();
        }, this.LOOP_INTERVAL);
    }

    /**
     * Stop the trading engine
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[Engine] 🛑 Trading Engine stopped');
    }

    /**
     * Main execution loop
     */
    private async executeLoop() {
        try {
            console.log('[Engine] 🔄 Starting execution cycle...');

            // Step A: Market Check - Get funding rate
            const fundingRate = await this.getFundingRate('ETH');

            console.log(`[Engine] 📈 Current ETH funding rate: ${(fundingRate * 100).toFixed(4)}%`);

            // Check if funding is above threshold (positive = shorts get paid)
            if (fundingRate <= this.FUNDING_THRESHOLD) {
                console.log(`[Engine] ⏭️  Funding too low (threshold: ${(this.FUNDING_THRESHOLD * 100).toFixed(4)}%), skipping cycle`);
                return;
            }

            console.log('[Engine] ✅ Funding rate favorable for short positions');

            // Step B: Agent Retrieval - Get all active "Safe" agents
            const agents = await this.getActiveAgents();

            if (agents.length === 0) {
                console.log('[Engine] 📭 No active agents found');
                return;
            }

            console.log(`[Engine] 👥 Found ${agents.length} active agent(s)`);

            // Step C: Execution - Loop through each agent
            for (const agent of agents) {
                await this.executeAgentStrategy(agent, fundingRate);
            }

            console.log('[Engine] ✅ Execution cycle complete');

        } catch (error) {
            console.error('[Engine] ❌ Error in execution loop:', error);
            // Don't crash the engine, just log and continue
        }
    }

    /**
     * Get the current funding rate for a given coin
     * Uses multiple methods with fallbacks for resilience
     * Returns 0 (neutral) if all methods fail to prevent engine crashes
     */
    private async getFundingRate(coin: string): Promise<number> {
        try {
            console.log(`[Engine] 🔍 Fetching funding rate for ${coin}...`);

            // Method 1: Try metaAndAssetCtxs (most reliable for current funding)
            try {
                const metaAndAssetCtxs = await this.infoClient.metaAndAssetCtxs();
                console.log('[Engine] 📊 Raw meta response received');

                // Find the coin asset in the universe
                const universe = metaAndAssetCtxs[0]?.universe;
                if (universe) {
                    const asset = universe.find((u: any) => u.name === coin);
                    if (asset && 'funding' in asset) {
                        const fundingRate = parseFloat((asset as any).funding || '0');
                        console.log(`[Engine] ✅ Funding rate from meta: ${(fundingRate * 100).toFixed(4)}%`);
                        return fundingRate;
                    }
                }
                console.log('[Engine] ⚠️  No funding rate in meta response');
            } catch (metaError) {
                console.warn('[Engine] ⚠️  metaAndAssetCtxs failed:', metaError);
            }

            // Method 2: Try fundingHistory as fallback
            try {
                const history = await this.infoClient.fundingHistory({
                    coin: coin,
                    startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
                });

                console.log('[Engine] 📊 Raw funding history length:', history?.length || 0);

                if (Array.isArray(history) && history.length > 0) {
                    // Get the most recent funding rate
                    const latestFunding = history[history.length - 1];
                    if (latestFunding && 'fundingRate' in latestFunding) {
                        const fundingRate = parseFloat(latestFunding.fundingRate);
                        console.log(`[Engine] ✅ Funding rate from history: ${(fundingRate * 100).toFixed(4)}%`);
                        return fundingRate;
                    }
                }
                console.log('[Engine] ⚠️  No funding history available');
            } catch (historyError) {
                console.warn('[Engine] ⚠️  fundingHistory failed:', historyError);
            }

            // If all methods fail, return 0 (neutral) with warning
            console.warn(`[Engine] ⚠️  Could not fetch funding rate for ${coin}, returning 0 (neutral)`);
            return 0;

        } catch (error) {
            console.error(`[Engine] ❌ Critical error fetching funding rate:`, error);
            // Return 0 instead of null to prevent engine crashes
            return 0;
        }
    }

    /**
     * Get all active agents with "Safe" strategy
     */
    private async getActiveAgents() {
        try {
            const agents = await prisma.agent.findMany({
                where: {
                    isActive: true,
                },
            });

            // Filter for "Safe"/"Conservative" strategy
            return agents.filter(agent => {
                try {
                    const config = JSON.parse(agent.strategyConfig);
                    return config.risk === 'Conservative' || config.risk === 'Safe';
                } catch {
                    return false;
                }
            });

        } catch (error) {
            console.error('[Engine] ❌ Error fetching agents:', error);
            return [];
        }
    }

    /**
     * Execute strategy for a single agent
     */
    private async executeAgentStrategy(agent: {
        id: number;
        walletAddress: string;
        encryptedPrivateKey: string;
        strategyConfig: string;
    }, fundingRate: number) {
        try {
            console.log(`[Engine] 🤖 Processing agent ${agent.id} (${agent.walletAddress})`);

            // Parse strategy config
            const config = JSON.parse(agent.strategyConfig);
            const strategy = config.risk || 'Conservative';
            const leverage = config.leverage || 1;

            console.log(`[Engine] 📋 Strategy: ${strategy}, Leverage: ${leverage}x`);

            // Decrypt private key
            const privateKey = decrypt(agent.encryptedPrivateKey);
            const wallet = new ethers.Wallet(privateKey);

            // Initialize ExchangeClient for this agent
            const transport = new HttpTransport();
            const exchangeClient = new ExchangeClient({ transport, wallet });

            // Check balance (perp clearinghouse account value holds deposits)
            const clearinghouse = await this.infoClient.clearinghouseState({
                user: agent.walletAddress
            });

            const accountValue = clearinghouse?.marginSummary?.accountValue;
            const balance = accountValue ? parseFloat(accountValue) : 0;

            console.log(`[Engine] 💰 Agent balance: ${balance.toFixed(2)} USDC`);

            if (balance < this.MIN_BALANCE) {
                console.log(`[Engine] ⏭️  Insufficient balance (min: ${this.MIN_BALANCE} USDC)`);
                return;
            }

            // Check for existing positions
            const positions = await this.infoClient.clearinghouseState({
                user: agent.walletAddress
            });

            const hasOpenPositions = positions.assetPositions?.some(
                (p: any) => parseFloat(p.position.szi) !== 0
            );

            if (hasOpenPositions) {
                console.log(`[Engine] ⏭️  Agent has open positions, skipping`);
                return;
            }

            // Execute strategy based on type
            if (strategy === 'Aggressive') {
                await this.executeAggressiveStrategy(exchangeClient, balance, leverage);
            } else {
                // Conservative/Safe strategy - funding rate arbitrage
                await this.executeConservativeStrategy(exchangeClient, balance, fundingRate, leverage);
            }

        } catch (error) {
            console.error(`[Engine] ❌ Error executing strategy for agent ${agent.id}:`, error);
            // Continue to next agent even if this one fails
        }
    }

    /**
     * Execute conservative strategy (funding rate arbitrage)
     */
    private async executeConservativeStrategy(
        exchangeClient: ExchangeClient,
        balance: number,
        fundingRate: number,
        leverage: number
    ) {
        console.log(`[Engine] 📉 Executing CONSERVATIVE strategy (funding arbitrage)...`);

        const midPrice = await this.getMidPrice('ETH');
        if (!midPrice || midPrice <= 0) {
            console.log('[Engine] ⚠️  Unable to fetch ETH price, skipping');
            return;
        }

        // Use 90% of balance as notional, convert to ETH size.
        const notionalUsd = balance * 0.9 * leverage;
        const sizeEth = notionalUsd / midPrice;
        const positionSize = sizeEth.toFixed(6);

        if (parseFloat(positionSize) <= 0) {
            console.log('[Engine] ⚠️  Position size too small, skipping');
            return;
        }

        const priceTick = await this.getPriceTickSize('ETH');
        const orderPrice = this.roundToTick(midPrice, priceTick);

        if (orderPrice <= 0) {
            console.log('[Engine] ⚠️  Invalid order price, skipping');
            return;
        }

        // Place market SHORT order (to receive funding)
        const order = await exchangeClient.order({
            orders: [
                {
                    a: 0, // Asset index for ETH
                    b: false, // is_buy = false (SHORT)
                    p: orderPrice.toString(), // Must be on tick size
                    s: positionSize, // Size
                    r: false, // reduce_only
                    t: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
                }
            ],
            grouping: 'na',
        });

        console.log(`[Engine] ✅ Conservative order executed:`, order);
        console.log(`[Engine] 📊 Expected funding yield: ${(fundingRate * 100).toFixed(4)}% per 8 hours`);
    }

    /**
     * Execute aggressive strategy (momentum-based trading)
     */
    private async executeAggressiveStrategy(
        exchangeClient: ExchangeClient,
        balance: number,
        leverage: number
    ) {
        console.log(`[Engine] ⚡ Executing AGGRESSIVE strategy (momentum trading)...`);

        // 1. Get recent candles for momentum calculation
        const candles = await this.infoClient.candleSnapshot({
            coin: 'ETH',
            interval: '15m',
            startTime: Date.now() - (4 * 60 * 60 * 1000), // Last 4 hours
        });

        if (candles.length < 2) {
            console.log(`[Engine] ⚠️  Not enough data for momentum calculation`);
            return;
        }

        // 2. Calculate price momentum (% change from 2 candles ago)
        const currentCandle = candles[candles.length - 1];
        if (!currentCandle) {
            console.log(`[Engine] ⚠️  No current candle data`);
            return;
        }

        const currentPrice = parseFloat(currentCandle.c);
        const previousCandle = candles[candles.length - 3] || candles[candles.length - 2];
        if (!previousCandle) {
            console.log(`[Engine] ⚠️  No previous candle data`);
            return;
        }

        const previousPrice = parseFloat(previousCandle.c);
        const momentum = ((currentPrice - previousPrice) / previousPrice) * 100;

        console.log(`[Engine] 📈 Price momentum: ${momentum.toFixed(2)}%`);

        // 3. Determine direction based on momentum
        let direction: 'LONG' | 'SHORT' | null = null;

        if (momentum > 0.5) {
            direction = 'LONG';
            console.log(`[Engine] 🚀 Strong upward momentum - going LONG`);
        } else if (momentum < -0.5) {
            direction = 'SHORT';
            console.log(`[Engine] 📉 Strong downward momentum - going SHORT`);
        } else {
            console.log(`[Engine] ⏭️  Momentum too weak (${momentum.toFixed(2)}%), skipping`);
            return;
        }

        const midPrice = await this.getMidPrice('ETH');
        if (!midPrice || midPrice <= 0) {
            console.log('[Engine] ⚠️  Unable to fetch ETH price, skipping');
            return;
        }

        // 4. Calculate position size with leverage (USD -> ETH)
        const notionalUsd = balance * 0.9 * leverage;
        const sizeEth = notionalUsd / midPrice;
        const positionSize = sizeEth.toFixed(6);

        if (parseFloat(positionSize) <= 0) {
            console.log('[Engine] ⚠️  Position size too small, skipping');
            return;
        }

        console.log(`[Engine] 💰 Position size: ${positionSize} ETH (~$${notionalUsd.toFixed(2)})`);

        const priceTick = await this.getPriceTickSize('ETH');
        const orderPrice = this.roundToTick(midPrice, priceTick);

        if (orderPrice <= 0) {
            console.log('[Engine] ⚠️  Invalid order price, skipping');
            return;
        }

        // 5. Place market order
        const order = await exchangeClient.order({
            orders: [
                {
                    a: 0, // ETH
                    b: direction === 'LONG', // is_buy
                    p: orderPrice.toString(), // Must be on tick size
                    s: positionSize,
                    r: false, // not reduce_only
                    t: { limit: { tif: 'Ioc' } },
                }
            ],
            grouping: 'na',
        });

        console.log(`[Engine] ✅ Aggressive ${direction} order executed:`, order);
        console.log(`[Engine] 📊 Expected return: >${Math.abs(momentum).toFixed(2)}% with ${leverage}x leverage`);
    }

    /**
     * Get engine status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            interval: this.LOOP_INTERVAL,
            fundingThreshold: this.FUNDING_THRESHOLD,
            minBalance: this.MIN_BALANCE,
        };
    }

    private async getMidPrice(coin: string): Promise<number> {
        try {
            const mids = await this.infoClient.allMids();
            const price = mids?.[coin];
            if (!price) return 0;
            return parseFloat(price);
        } catch (error) {
            console.warn('[Engine] ⚠️  Failed to fetch mid price:', error);
            return 0;
        }
    }

    private async getPriceTickSize(coin: string): Promise<number> {
        try {
            const metaAndAssetCtxs = await this.infoClient.metaAndAssetCtxs();
            const universe = metaAndAssetCtxs[0]?.universe || [];
            const asset = universe.find((u: any) => u.name === coin);
            if (!asset || typeof asset?.szDecimals !== 'number') return 0.01;
            return Math.pow(10, -asset.szDecimals);
        } catch (error) {
            console.warn('[Engine] ⚠️  Failed to fetch tick size:', error);
            return 0.01;
        }
    }

    private roundToTick(price: number, tick: number): number {
        if (!tick || tick <= 0) return Math.floor(price);
        return Math.floor(price / tick) * tick;
    }
}
