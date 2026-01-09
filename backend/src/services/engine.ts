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
    private readonly FUNDING_THRESHOLD = 0.001; // 0.1% (expressed as 0.001)
    private readonly MIN_BALANCE = 10; // 10 USDC minimum
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

            if (!fundingRate) {
                console.log('[Engine] ⚠️  Could not fetch funding rate, skipping cycle');
                return;
            }

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
     * Get current funding rate for a coin
     */
    private async getFundingRate(coin: string): Promise<number | null> {
        try {
            const meta = await this.infoClient.meta();
            const universe = meta.universe;

            // Find the coin in the universe
            const coinInfo = universe.find((u: any) => u.name === coin);

            if (!coinInfo) {
                console.log(`[Engine] ⚠️  Coin ${coin} not found in universe`);
                return null;
            }

            // Get funding info
            const fundingInfo = await this.infoClient.fundingHistory({
                coin,
                startTime: Date.now() - 3600000, // Last hour
            });

            if (!fundingInfo || fundingInfo.length === 0) {
                return null;
            }

            // Get the most recent funding rate
            const latestFunding = fundingInfo[fundingInfo.length - 1];
            if (!latestFunding) return null;
            return parseFloat(latestFunding.fundingRate);

        } catch (error) {
            console.error('[Engine] ❌ Error fetching funding rate:', error);
            return null;
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

            // Decrypt private key
            const privateKey = decrypt(agent.encryptedPrivateKey);
            const wallet = new ethers.Wallet(privateKey);

            // Initialize ExchangeClient for this agent
            const transport = new HttpTransport();
            const exchangeClient = new ExchangeClient({ transport, wallet });

            // Check balance
            const state = await this.infoClient.spotClearinghouseState({
                user: agent.walletAddress
            });

            const usdcBalance = state.balances.find((b: any) => b.coin === 'USDC');
            const balance = usdcBalance ? parseFloat(usdcBalance.total) : 0;

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

            // Execute short position (1x leverage for safety)
            console.log(`[Engine] 📉 Executing SHORT order for agent...`);

            // Calculate position size (use 90% of balance for safety)
            const positionSize = (balance * 0.9).toFixed(2);

            // Place market order to exchange client
            const order = await exchangeClient.order({
                orders: [
                    {
                        a: 0, // Asset index for ETH
                        b: false, // is_buy = false (SHORT)
                        p: '0', // Price (0 for market)
                        s: positionSize, // Size
                        r: false, // reduce_only
                        t: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
                    }
                ],
                grouping: 'na',
            });

            console.log(`[Engine] ✅ Order executed:`, order);
            console.log(`[Engine] 📊 Expected funding yield: ${(fundingRate * 100).toFixed(4)}% per 8 hours`);

        } catch (error) {
            console.error(`[Engine] ❌ Error executing strategy for agent ${agent.id}:`, error);
            // Continue to next agent even if this one fails
        }
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
}
