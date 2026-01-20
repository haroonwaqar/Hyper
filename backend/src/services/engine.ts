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
    private readonly MIN_BALANCE = 10; // 10 USDC minimum (Hyperliquid min order)
    private readonly MIN_ORDER_USD = 10; // Hyperliquid min order notional
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

        const marketPrice = await this.getMarketPrice('ETH');
        if (
            !marketPrice ||
            marketPrice.assetIndex == null ||
            !marketPrice.priceStr ||
            !Number.isFinite(marketPrice.price) ||
            marketPrice.price <= 0
        ) {
            console.log('[Engine] ⚠️  Unable to fetch ETH price, skipping');
            return;
        }

        // Use 90% of balance as notional, convert to ETH size.
        let notionalUsd = balance * 0.9 * leverage;
        if (notionalUsd < this.MIN_ORDER_USD) {
            console.log(`[Engine] ⏭️  Order notional too small ($${notionalUsd.toFixed(2)} < $${this.MIN_ORDER_USD})`);
            return;
        }
        const sizeEth = notionalUsd / marketPrice.price;
        const sizeDecimals = await this.getSizeDecimals('ETH');
        const positionSize = this.formatDecimal(sizeEth, sizeDecimals);

        if (!Number.isFinite(sizeEth) || parseFloat(positionSize) <= 0) {
            console.log('[Engine] ⚠️  Position size too small, skipping');
            return;
        }

        const priceTick = this.getPriceTick('ETH');
        const orderPrice = this.roundToTick(marketPrice.price, priceTick);
        const orderPriceStr = this.formatDecimal(orderPrice, this.tickToDecimals(priceTick));

        if (!Number.isFinite(orderPrice) || orderPrice <= 0) {
            console.log('[Engine] ⚠️  Invalid order price, skipping');
            return;
        }
        console.log(`[Engine] 🧮 midPx=${marketPrice.priceStr} price=${orderPriceStr} size=${positionSize}`);

        // Place market SHORT order (to receive funding)
        const order = await exchangeClient.order({
            orders: [
                {
                    a: marketPrice.assetIndex, // Asset index for ETH
                    b: false, // is_buy = false (SHORT)
                    p: orderPriceStr,
                    s: positionSize, // Size
                    r: false, // reduce_only
                    t: { limit: { tif: 'FrontendMarket' } }, // Market-style
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

        const marketPrice = await this.getMarketPrice('ETH');
        if (
            !marketPrice ||
            marketPrice.assetIndex == null ||
            !marketPrice.priceStr ||
            !Number.isFinite(marketPrice.price) ||
            marketPrice.price <= 0
        ) {
            console.log('[Engine] ⚠️  Unable to fetch ETH price, skipping');
            return;
        }

        // 4. Calculate position size with leverage (USD -> ETH)
        let notionalUsd = balance * 0.9 * leverage;
        if (notionalUsd < this.MIN_ORDER_USD) {
            console.log(`[Engine] ⏭️  Order notional too small ($${notionalUsd.toFixed(2)} < $${this.MIN_ORDER_USD})`);
            return;
        }
        const sizeEth = notionalUsd / marketPrice.price;
        const sizeDecimals = await this.getSizeDecimals('ETH');
        const positionSize = this.formatDecimal(sizeEth, sizeDecimals);

        if (!Number.isFinite(sizeEth) || parseFloat(positionSize) <= 0) {
            console.log('[Engine] ⚠️  Position size too small, skipping');
            return;
        }

        console.log(`[Engine] 💰 Position size: ${positionSize} ETH (~$${notionalUsd.toFixed(2)})`);

        const priceTick = this.getPriceTick('ETH');
        const orderPrice = this.roundToTick(marketPrice.price, priceTick);
        const orderPriceStr = this.formatDecimal(orderPrice, this.tickToDecimals(priceTick));

        if (!Number.isFinite(orderPrice) || orderPrice <= 0) {
            console.log('[Engine] ⚠️  Invalid order price, skipping');
            return;
        }
        console.log(`[Engine] 🧮 midPx=${marketPrice.priceStr} price=${orderPriceStr} size=${positionSize}`);

        // 5. Place market order
        const order = await exchangeClient.order({
            orders: [
                {
                    a: marketPrice.assetIndex, // ETH
                    b: direction === 'LONG', // is_buy
                    p: orderPriceStr,
                    s: positionSize,
                    r: false, // not reduce_only
                    t: { limit: { tif: 'FrontendMarket' } },
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

    private async getMarketPrice(
        coin: string
    ): Promise<{ price: number; priceStr: string; assetIndex: number } | null> {
        try {
            const [meta, assetCtxs] = await this.infoClient.metaAndAssetCtxs();
            const universe = meta?.universe || [];
            const assetIndex = universe.findIndex((u: any) => u.name === coin);
            if (assetIndex < 0) return null;
            const ctx = assetCtxs?.[assetIndex];
            const priceStr = (ctx?.midPx ?? ctx?.markPx ?? '').toString();
            if (!priceStr) return null;
            const price = parseFloat(priceStr);
            if (!Number.isFinite(price)) return null;
            return { price, priceStr, assetIndex };
        } catch (error) {
            console.warn('[Engine] ⚠️  Failed to fetch market price:', error);
            return null;
        }
    }

    private async getSizeDecimals(coin: string): Promise<number> {
        try {
            const meta = await this.infoClient.meta();
            const universe = meta?.universe || [];
            const asset = universe.find((u: any) => u.name === coin);
            if (!asset || typeof asset?.szDecimals !== 'number') return 6;
            return asset.szDecimals;
        } catch (error) {
            console.warn('[Engine] ⚠️  Failed to fetch size decimals:', error);
            return 6;
        }
    }

    private formatDecimal(value: number, decimals: number): string {
        if (!Number.isFinite(value)) return '0';
        const fixed = value.toFixed(decimals);
        return fixed.replace(/\.?0+$/, '');
    }

    private getPriceTick(coin: string): number {
        // Hyperliquid ETH tick is 0.5; fallback to 0.01 for others.
        if (coin === 'ETH') return 0.5;
        return 0.01;
    }

    private tickToDecimals(tick: number): number {
        const tickStr = tick.toString();
        const dot = tickStr.indexOf('.');
        return dot === -1 ? 0 : tickStr.length - dot - 1;
    }

    private roundToTick(price: number, tick: number): number {
        if (!tick || tick <= 0) return Math.floor(price);
        return Math.floor(price / tick) * tick;
    }
}
