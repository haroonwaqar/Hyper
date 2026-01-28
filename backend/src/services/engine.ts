// Trading Engine for HyperWorld
// Strictly spot trading (no perps), no leverage, no shorting.
// Strategy: HYPE/USDC DCA buys + 1% take-profit sells.

import { prisma } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import { ethers } from 'ethers';
import { InfoClient, ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';

type SpotMarketInfo = {
    marketAssetId: number; // spot market index (typically 10000+)
    hypeTokenIndex: number;
    usdcTokenIndex: number;
    hypeSzDecimals: number;
    priceStr: string; // midPx or markPx string from spot ctx
    price: number;
};

export class TradingEngine {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private infoClient: InfoClient;

    // Strategy params
    private readonly LOOP_INTERVAL_MS = 60_000;
    private readonly BASE_COIN = 'HYPE';
    private readonly QUOTE_COIN = 'USDC';
    private readonly MIN_USDC_TO_BUY = 10; // Hyperliquid min notional is ~$10
    private readonly TAKE_PROFIT_PCT = 0.01; // +1%
    private readonly BUY_COOLDOWN_MS = 10 * 60_000;
    private readonly SELL_COOLDOWN_MS = 5 * 60_000;

    // In-memory throttles to avoid spamming orders
    private lastBuyAtByAgent: Map<string, number> = new Map();
    private lastSellAtByAgent: Map<string, number> = new Map();

    // Cache spot meta/ctxs for a short period
    private spotMarketCache: { at: number; info: SpotMarketInfo } | null = null;
    private readonly SPOT_CACHE_TTL_MS = 30_000;

    constructor() {
        const transport = new HttpTransport();
        this.infoClient = new InfoClient({ transport });
    }

    start() {
        if (this.isRunning) {
            console.log('[Engine] ⚠️  Already running');
            return;
        }
        this.isRunning = true;
        console.log('[Engine] 🚀 Starting Trading Engine...');
        console.log('[Engine] 📈 Mode: Spot Trading');
        console.log(`[Engine] 🎯 Pair: ${this.BASE_COIN}/${this.QUOTE_COIN}`);
        console.log(`[Engine] ⏱️  Loop Interval: ${Math.round(this.LOOP_INTERVAL_MS / 1000)}s`);

        void this.executeLoop();
        this.intervalId = setInterval(() => void this.executeLoop(), this.LOOP_INTERVAL_MS);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[Engine] 🛑 Trading Engine stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalMs: this.LOOP_INTERVAL_MS,
            mode: 'halal-spot',
            pair: `${this.BASE_COIN}/${this.QUOTE_COIN}`,
            minBuyUsdc: this.MIN_USDC_TO_BUY,
            takeProfitPct: this.TAKE_PROFIT_PCT,
        };
    }

    private async executeLoop() {
        try {
            console.log('[Engine] 🔄 Starting execution cycle...');

            const market = await this.getSpotMarketInfo();
            console.log(`[Engine] 📈 ${this.BASE_COIN} price: ${market.priceStr} ${this.QUOTE_COIN}`);

            // Fetch active agents only ( engine trades only when active)
            const agents = await prisma.agent.findMany({ where: { isActive: true } });
            console.log(`[Engine] 👥 Found ${agents.length} active agent(s)`);
            if (agents.length === 0) return;

            for (const agent of agents) {
                await this.executeAgentSpotStrategy(agent.walletAddress, agent.encryptedPrivateKey, market);
            }

            console.log('[Engine] ✅ Execution cycle complete');
        } catch (error) {
            console.error('[Engine] ❌ Error in execution loop:', error);
        }
    }

    private async executeAgentSpotStrategy(agentAddress: string, encryptedPrivateKey: string, market: SpotMarketInfo) {
        console.log(`[Engine] 🤖 Processing agent (${agentAddress})`);

        const spot = await this.infoClient.spotClearinghouseState({ user: agentAddress });
        const usdc = spot.balances.find((b: any) => b.coin === this.QUOTE_COIN);
        const hype = spot.balances.find((b: any) => b.coin === this.BASE_COIN);

        const usdcTotal = usdc ? parseFloat(usdc.total) : 0;
        const usdcHold = usdc ? parseFloat(usdc.hold) : 0;
        const usdcAvailable = Math.max(0, usdcTotal - usdcHold);

        const hypeTotal = hype ? parseFloat(hype.total) : 0;
        const hypeHold = hype ? parseFloat(hype.hold) : 0;
        const hypeAvailable = Math.max(0, hypeTotal - hypeHold);

        const hypeEntryNtl = hype ? parseFloat(hype.entryNtl) : 0; // USDC notional for position cost basis
        const avgEntry = hypeTotal > 0 ? hypeEntryNtl / hypeTotal : 0;

        console.log(`[Engine] 💵 Spot USDC: ${usdcAvailable.toFixed(4)} | ${this.BASE_COIN}: ${hypeAvailable.toFixed(6)}`);
        if (hypeTotal > 0 && avgEntry > 0) {
            console.log(`[Engine] 📌 Avg entry: ${avgEntry.toFixed(4)} ${this.QUOTE_COIN}`);
        }

        const wallet = new ethers.Wallet(decrypt(encryptedPrivateKey));
        const transport = new HttpTransport();
        const exchangeClient = new ExchangeClient({ transport, wallet });

        // Wallet split fix: if Spot USDC is low but Perp account has USDC, transfer Perp -> Spot.
        if (usdcAvailable < this.MIN_USDC_TO_BUY) {
            const perp = await this.infoClient.clearinghouseState({ user: agentAddress });
            const perpValue = parseFloat(perp?.marginSummary?.accountValue || '0');
            if (perpValue >= this.MIN_USDC_TO_BUY) {
                // Transfer up to MIN_USDC_TO_BUY (or all perp value if smaller) with a small buffer.
                const transferAmount = Math.max(0, Math.min(perpValue, this.MIN_USDC_TO_BUY) - 0.01);
                if (transferAmount > 0) {
                    console.log(`[Engine] 🔁 Moving $${transferAmount.toFixed(2)} USDC from Perp -> Spot (wallet split)`); 
                    await exchangeClient.usdClassTransfer({ amount: transferAmount.toFixed(2), toPerp: false });
                    // Re-fetch spot after transfer
                    const spotAfter = await this.infoClient.spotClearinghouseState({ user: agentAddress });
                    const usdcAfter = spotAfter.balances.find((b: any) => b.coin === this.QUOTE_COIN);
                    const usdcAfterTotal = usdcAfter ? parseFloat(usdcAfter.total) : 0;
                    const usdcAfterHold = usdcAfter ? parseFloat(usdcAfter.hold) : 0;
                    const usdcAfterAvailable = Math.max(0, usdcAfterTotal - usdcAfterHold);
                    console.log(`[Engine] ✅ Spot USDC after transfer: ${usdcAfterAvailable.toFixed(4)}`);
                }
            }
        }

        // TAKE PROFIT: if we hold HYPE and price >= avgEntry * 1.01, sell.
        const takeProfitPx = avgEntry > 0 ? avgEntry * (1 + this.TAKE_PROFIT_PCT) : 0;
        if (hypeAvailable > 0 && takeProfitPx > 0 && market.price >= takeProfitPx) {
            const now = Date.now();
            const lastSell = this.lastSellAtByAgent.get(agentAddress) ?? 0;
            if (now - lastSell < this.SELL_COOLDOWN_MS) {
                console.log('[Engine] ⏭️  Sell cooldown active, skipping');
            } else {
                const sellNotional = hypeAvailable * market.price;
                if (sellNotional < this.MIN_USDC_TO_BUY) {
                    console.log(`[Engine] ⏭️  Sell notional too small ($${sellNotional.toFixed(2)}), skipping`);
                } else {
                    const sellSizeStr = this.formatDecimal(hypeAvailable, market.hypeSzDecimals);
                    console.log(`[Engine] ✅ Take profit triggered. Selling ${sellSizeStr} ${this.BASE_COIN} @ ${market.priceStr}`);
                    await exchangeClient.order({
                        orders: [
                            {
                                a: market.marketAssetId,
                                b: false, // SELL
                                p: market.priceStr,
                                s: sellSizeStr,
                                r: false,
                                t: { limit: { tif: 'Gtc' } },
                            },
                        ],
                        grouping: 'na',
                    });
                    this.lastSellAtByAgent.set(agentAddress, now);
                }
            }
        }

        // DCA BUY: if USDC available >= $10, buy $10 worth at mid/mark.
        if (usdcAvailable >= this.MIN_USDC_TO_BUY) {
            const now = Date.now();
            const lastBuy = this.lastBuyAtByAgent.get(agentAddress) ?? 0;
            if (now - lastBuy < this.BUY_COOLDOWN_MS) {
                console.log('[Engine] ⏭️  Buy cooldown active, skipping');
                return;
            }

            // Fixed DCA size: $10 (or all available if just above min)
            const buyNotional = Math.min(usdcAvailable, this.MIN_USDC_TO_BUY);
            const buySize = buyNotional / market.price;
            const buySizeStr = this.formatDecimal(buySize, market.hypeSzDecimals);
            if (!buySizeStr || parseFloat(buySizeStr) <= 0) {
                console.log('[Engine] ⚠️  Computed buy size invalid, skipping');
                return;
            }

            console.log(`[Engine] 🟦 DCA buy: $${buyNotional.toFixed(2)} -> ${buySizeStr} ${this.BASE_COIN} @ ${market.priceStr}`);
            await exchangeClient.order({
                orders: [
                    {
                        a: market.marketAssetId,
                        b: true, // BUY
                        p: market.priceStr,
                        s: buySizeStr,
                        r: false,
                        t: { limit: { tif: 'Gtc' } },
                    },
                ],
                grouping: 'na',
            });
            this.lastBuyAtByAgent.set(agentAddress, now);
        }
    }

    private async getSpotMarketInfo(): Promise<SpotMarketInfo> {
        const now = Date.now();
        if (this.spotMarketCache && now - this.spotMarketCache.at < this.SPOT_CACHE_TTL_MS) {
            return this.spotMarketCache.info;
        }

        const [meta, assetCtxs] = await this.infoClient.spotMetaAndAssetCtxs();

        const hypeToken = meta.tokens.find((t: any) => t.name === this.BASE_COIN);
        const usdcToken = meta.tokens.find((t: any) => t.name === this.QUOTE_COIN);
        if (!hypeToken) throw new Error(`Spot token not found: ${this.BASE_COIN}`);
        if (!usdcToken) throw new Error(`Spot token not found: ${this.QUOTE_COIN}`);

        // Find spot market (universe) for HYPE/USDC.
        // Prefer name match; fallback to token set match.
        let marketIdx = meta.universe.findIndex((u: any) =>
            typeof u?.name === 'string' &&
            u.name.toUpperCase().includes(this.BASE_COIN) &&
            u.name.toUpperCase().includes(this.QUOTE_COIN)
        );
        if (marketIdx < 0) {
            marketIdx = meta.universe.findIndex((u: any) => {
                const tokens = Array.isArray(u?.tokens) ? u.tokens : [];
                return tokens.includes(hypeToken.index) && tokens.includes(usdcToken.index);
            });
        }
        if (marketIdx < 0) {
            throw new Error(`Spot market not found for ${this.BASE_COIN}/${this.QUOTE_COIN}`);
        }

        const universeEntry = meta.universe[marketIdx];
        if (!universeEntry) {
            throw new Error(`Spot market entry missing at index ${marketIdx}`);
        }
        const marketAssetId = universeEntry.index; // 10000+ style asset id for spot markets

        // Spot context list aligns with universe ordering in spotMetaAndAssetCtxs.
        // For price, use ctx.midPx if present, else markPx.
        const ctx = assetCtxs?.[marketIdx] as any;
        const priceStrRaw = (ctx?.midPx ?? ctx?.markPx ?? '').toString();
        if (!priceStrRaw) throw new Error('Missing spot price for market');
        const price = parseFloat(priceStrRaw);
        if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid spot price');

        const info: SpotMarketInfo = {
            marketAssetId,
            hypeTokenIndex: hypeToken.index,
            usdcTokenIndex: usdcToken.index,
            hypeSzDecimals: hypeToken.szDecimals ?? 6,
            priceStr: priceStrRaw,
            price,
        };

        this.spotMarketCache = { at: now, info };
        return info;
    }

    private formatDecimal(value: number, decimals: number): string {
        if (!Number.isFinite(value)) return '0';
        const fixed = value.toFixed(decimals);
        return fixed.replace(/\.?0+$/, '');
    }
}

