export declare class TradingEngine {
    private intervalId;
    private isRunning;
    private infoClient;
    private readonly LOOP_INTERVAL_MS;
    private readonly BASE_COIN;
    private readonly QUOTE_COIN;
    private readonly MIN_USDC_TO_BUY;
    private readonly TAKE_PROFIT_PCT;
    private readonly BUY_COOLDOWN_MS;
    private readonly SELL_COOLDOWN_MS;
    private lastBuyAtByAgent;
    private lastSellAtByAgent;
    private spotMarketCache;
    private readonly SPOT_CACHE_TTL_MS;
    constructor();
    start(): void;
    stop(): void;
    getStatus(): {
        isRunning: boolean;
        intervalMs: number;
        mode: string;
        pair: string;
        minBuyUsdc: number;
        takeProfitPct: number;
    };
    private executeLoop;
    private executeAgentSpotStrategy;
    private closeAllPerpPositionsIfAny;
    private getSpotMarketInfo;
    private formatDecimal;
    /**
     * Hyperliquid PERP tick sizes aren't exposed in metaAndAssetCtxs.
     * We keep a small mapping for major assets to avoid tick rejections during legacy cleanup.
     * Defaults to 1 which is valid for most major perps.
     */
    private getPerpPriceTick;
    private formatPriceToTick;
    private tickDecimals;
}
//# sourceMappingURL=engine.d.ts.map