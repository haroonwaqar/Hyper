// Trading Engine for HyperWorld
// Strictly spot trading (no perps), no leverage, no shorting.
// Strategy: HYPE/USDC DCA buys + 1% take-profit sells.
import { prisma } from '../db.js';
import { decrypt } from '../utils/encryption.js';
import { ethers } from 'ethers';
import { InfoClient, ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
export class TradingEngine {
    intervalId = null;
    isRunning = false;
    infoClient;
    // Strategy params
    LOOP_INTERVAL_MS = 60_000;
    BASE_COIN = 'HYPE';
    QUOTE_COIN = 'USDC';
    MIN_USDC_TO_BUY = 10; // Hyperliquid min notional is ~$10
    TAKE_PROFIT_PCT = 0.01; // +1%
    BUY_COOLDOWN_MS = 10 * 60_000;
    SELL_COOLDOWN_MS = 5 * 60_000;
    // In-memory throttles to avoid spamming orders
    lastBuyAtByAgent = new Map();
    lastSellAtByAgent = new Map();
    // Cache spot meta/ctxs for a short period
    spotMarketCache = null;
    SPOT_CACHE_TTL_MS = 30_000;
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
    async executeLoop() {
        try {
            console.log('[Engine] 🔄 Starting execution cycle...');
            const market = await this.getSpotMarketInfo();
            console.log(`[Engine] 📈 ${this.BASE_COIN} price: ${market.priceStr} ${this.QUOTE_COIN}`);
            // Fetch active agents only ( engine trades only when active)
            const agents = await prisma.agent.findMany({ where: { isActive: true } });
            console.log(`[Engine] 👥 Found ${agents.length} active agent(s)`);
            if (agents.length === 0)
                return;
            for (const agent of agents) {
                await this.executeAgentSpotStrategy(agent.walletAddress, agent.encryptedPrivateKey, market);
            }
            console.log('[Engine] ✅ Execution cycle complete');
        }
        catch (error) {
            console.error('[Engine] ❌ Error in execution loop:', error);
        }
    }
    async executeAgentSpotStrategy(agentAddress, encryptedPrivateKey, market) {
        console.log(`[Engine] 🤖 Processing agent (${agentAddress})`);
        const wallet = new ethers.Wallet(decrypt(encryptedPrivateKey));
        const transport = new HttpTransport();
        const exchangeClient = new ExchangeClient({ transport, wallet });
        // SAFETY CLEANUP: if there are legacy PERP positions, close them immediately (no new perps allowed).
        const perpsCleared = await this.closeAllPerpPositionsIfAny(agentAddress, exchangeClient);
        if (!perpsCleared) {
            console.log('[Engine] ⏭️  Skipping spot strategy until legacy PERP positions are fully closed.');
            return;
        }
        const spot = await this.infoClient.spotClearinghouseState({ user: agentAddress });
        const usdc = spot.balances.find((b) => b.coin === this.QUOTE_COIN);
        const hype = spot.balances.find((b) => b.coin === this.BASE_COIN);
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
        // Wallet split fix: if Spot USDC is low but Perp account has USDC, transfer Perp -> Spot.
        if (usdcAvailable < this.MIN_USDC_TO_BUY) {
            const perp = await this.infoClient.clearinghouseState({ user: agentAddress });
            const perpValue = parseFloat(perp?.marginSummary?.accountValue || '0');
            if (perpValue > 0) {
                // Transfer as much as possible (minus small buffer) so spot bot can operate.
                const transferAmount = Math.max(0, perpValue - 0.01);
                if (transferAmount >= 0.01) {
                    console.log(`[Engine] 🔁 Moving $${transferAmount.toFixed(2)} USDC from Perp -> Spot (wallet split)`);
                    await exchangeClient.usdClassTransfer({ amount: transferAmount.toFixed(2), toPerp: false });
                }
            }
        }
        // Re-fetch spot after any transfer/cleanup
        const spot2 = await this.infoClient.spotClearinghouseState({ user: agentAddress });
        const usdc2 = spot2.balances.find((b) => b.coin === this.QUOTE_COIN);
        const hype2 = spot2.balances.find((b) => b.coin === this.BASE_COIN);
        const usdc2Total = usdc2 ? parseFloat(usdc2.total) : 0;
        const usdc2Hold = usdc2 ? parseFloat(usdc2.hold) : 0;
        const usdc2Available = Math.max(0, usdc2Total - usdc2Hold);
        const hype2Total = hype2 ? parseFloat(hype2.total) : 0;
        const hype2Hold = hype2 ? parseFloat(hype2.hold) : 0;
        const hype2Available = Math.max(0, hype2Total - hype2Hold);
        const hype2EntryNtl = hype2 ? parseFloat(hype2.entryNtl) : 0;
        const avgEntry2 = hype2Total > 0 ? hype2EntryNtl / hype2Total : 0;
        const hypeAvailableFinal = hype2Available;
        const usdcAvailableFinal = usdc2Available;
        const avgEntryFinal = avgEntry2;
        console.log(`[Engine] 📦 Final spot balances -> USDC: ${usdcAvailableFinal.toFixed(4)} | ${this.BASE_COIN}: ${hypeAvailableFinal.toFixed(6)}`);
        // TAKE PROFIT: if we hold HYPE and price >= avgEntry * 1.01, sell.
        const takeProfitPx = avgEntryFinal > 0 ? avgEntryFinal * (1 + this.TAKE_PROFIT_PCT) : 0;
        if (hypeAvailableFinal > 0 && takeProfitPx > 0 && market.price >= takeProfitPx) {
            const now = Date.now();
            const lastSell = this.lastSellAtByAgent.get(agentAddress) ?? 0;
            if (now - lastSell < this.SELL_COOLDOWN_MS) {
                console.log('[Engine] ⏭️  Sell cooldown active, skipping');
            }
            else {
                const sellNotional = hypeAvailableFinal * market.price;
                if (sellNotional < this.MIN_USDC_TO_BUY) {
                    console.log(`[Engine] ⏭️  Sell notional too small ($${sellNotional.toFixed(2)}), skipping`);
                }
                else {
                    const sellSizeStr = this.formatDecimal(hypeAvailableFinal, market.hypeSzDecimals);
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
        if (usdcAvailableFinal >= this.MIN_USDC_TO_BUY) {
            const now = Date.now();
            const lastBuy = this.lastBuyAtByAgent.get(agentAddress) ?? 0;
            if (now - lastBuy < this.BUY_COOLDOWN_MS) {
                console.log('[Engine] ⏭️  Buy cooldown active, skipping');
                return;
            }
            // Fixed DCA size: $10 (or all available if just above min)
            const buyNotional = Math.min(usdcAvailableFinal, this.MIN_USDC_TO_BUY);
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
    async closeAllPerpPositionsIfAny(agentAddress, exchangeClient) {
        const perp = await this.infoClient.clearinghouseState({ user: agentAddress });
        const openPositions = perp.assetPositions?.filter((p) => parseFloat(p.position.szi) !== 0) || [];
        if (openPositions.length === 0)
            return true;
        console.log(`[Engine] 🧹 Legacy PERP positions detected (${openPositions.length}). Closing to comply with Halal spot-only mandate.`);
        const [meta, assetCtxs] = await this.infoClient.metaAndAssetCtxs();
        const universe = meta?.universe || [];
        let allClosed = true;
        for (const pos of openPositions) {
            try {
                const coin = pos.position.coin;
                const szi = parseFloat(pos.position.szi);
                const size = Math.abs(szi);
                if (!Number.isFinite(size) || size <= 0)
                    continue;
                const assetIndex = universe.findIndex((u) => u.name === coin);
                if (assetIndex < 0) {
                    console.log(`[Engine] ⚠️  Unknown perp asset ${coin}, skipping close`);
                    allClosed = false;
                    continue;
                }
                const szDecimals = Number(universe?.[assetIndex]?.szDecimals ?? 6);
                const sizeStr = this.formatDecimal(size, Number.isFinite(szDecimals) ? szDecimals : 6);
                if (!sizeStr || parseFloat(sizeStr) <= 0) {
                    console.log(`[Engine] ⚠️  Invalid size for ${coin}, skipping close`);
                    allClosed = false;
                    continue;
                }
                const ctx = assetCtxs?.[assetIndex];
                const pxRaw = (ctx?.midPx ?? ctx?.markPx ?? ctx?.oraclePx ?? '').toString();
                const px = parseFloat(pxRaw);
                if (!Number.isFinite(px) || px <= 0) {
                    console.log(`[Engine] ⚠️  Missing/invalid price for ${coin}, skipping close`);
                    allClosed = false;
                    continue;
                }
                // close short -> buy, close long -> sell
                const isBuy = szi < 0;
                // Use a slightly aggressive price bound + tick-aligned formatting so IOC-style closes don't get rejected.
                const tick = this.getPerpPriceTick(coin);
                const targetPx = isBuy ? px * 1.01 : px * 0.99;
                const priceStr = this.formatPriceToTick(targetPx, tick, isBuy ? 'up' : 'down');
                console.log(`[Engine] 🛑 Closing PERP ${coin}: ${sizeStr} (${isBuy ? 'BUY' : 'SELL'}) @ ${priceStr}`);
                await exchangeClient.order({
                    orders: [
                        {
                            a: assetIndex,
                            b: isBuy,
                            p: priceStr,
                            s: sizeStr,
                            r: true,
                            t: { limit: { tif: 'Ioc' } },
                        },
                    ],
                    grouping: 'na',
                });
            }
            catch (e) {
                allClosed = false;
                console.error('[Engine] ⚠️  Failed to close legacy PERP position (will retry next cycle):', e);
            }
        }
        return allClosed;
    }
    async getSpotMarketInfo() {
        const now = Date.now();
        if (this.spotMarketCache && now - this.spotMarketCache.at < this.SPOT_CACHE_TTL_MS) {
            return this.spotMarketCache.info;
        }
        const [meta, assetCtxs] = await this.infoClient.spotMetaAndAssetCtxs();
        const hypeToken = meta.tokens.find((t) => t.name === this.BASE_COIN);
        const usdcToken = meta.tokens.find((t) => t.name === this.QUOTE_COIN);
        if (!hypeToken)
            throw new Error(`Spot token not found: ${this.BASE_COIN}`);
        if (!usdcToken)
            throw new Error(`Spot token not found: ${this.QUOTE_COIN}`);
        // Find spot market (universe) for HYPE/USDC.
        // Prefer name match; fallback to token set match.
        let marketIdx = meta.universe.findIndex((u) => typeof u?.name === 'string' &&
            u.name.toUpperCase().includes(this.BASE_COIN) &&
            u.name.toUpperCase().includes(this.QUOTE_COIN));
        if (marketIdx < 0) {
            marketIdx = meta.universe.findIndex((u) => {
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
        const ctx = assetCtxs?.[marketIdx];
        const priceStrRaw = (ctx?.midPx ?? ctx?.markPx ?? '').toString();
        if (!priceStrRaw)
            throw new Error('Missing spot price for market');
        const price = parseFloat(priceStrRaw);
        if (!Number.isFinite(price) || price <= 0)
            throw new Error('Invalid spot price');
        const info = {
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
    formatDecimal(value, decimals) {
        if (!Number.isFinite(value))
            return '0';
        const fixed = value.toFixed(decimals);
        return fixed.replace(/\.?0+$/, '');
    }
    /**
     * Hyperliquid PERP tick sizes aren't exposed in metaAndAssetCtxs.
     * We keep a small mapping for major assets to avoid tick rejections during legacy cleanup.
     * Defaults to 1 which is valid for most major perps.
     */
    getPerpPriceTick(coin) {
        const c = coin.toUpperCase();
        // Use coarse ticks for majors to stay valid across likely tick sizes.
        if (c === 'BTC')
            return 10;
        if (c === 'ETH')
            return 10;
        if (c === 'SOL')
            return 0.01;
        if (c === 'HYPE')
            return 0.0001;
        return 1;
    }
    formatPriceToTick(price, tick, mode) {
        const px = Number.isFinite(price) ? price : 0;
        const tk = Number.isFinite(tick) && tick > 0 ? tick : 1;
        const decimals = this.tickDecimals(tk);
        // Avoid floating drift by rounding after tick step selection.
        const steps = mode === 'up' ? Math.ceil(px / tk) : Math.floor(px / tk);
        const snapped = steps * tk;
        const snappedFixed = Number(snapped.toFixed(decimals));
        return snappedFixed.toFixed(decimals).replace(/\.?0+$/, '');
    }
    tickDecimals(tick) {
        const s = tick.toString();
        if (!s.includes('.'))
            return 0;
        return s.split('.')[1]?.length ?? 0;
    }
}
//# sourceMappingURL=engine.js.map