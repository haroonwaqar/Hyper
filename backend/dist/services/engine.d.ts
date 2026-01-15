export declare class TradingEngine {
    private intervalId;
    private isRunning;
    private infoClient;
    private readonly FUNDING_THRESHOLD;
    private readonly MIN_BALANCE;
    private readonly LOOP_INTERVAL;
    constructor();
    /**
     * Start the trading engine
     */
    start(): void;
    /**
     * Stop the trading engine
     */
    stop(): void;
    /**
     * Main execution loop
     */
    private executeLoop;
    /**
     * Get the current funding rate for a given coin
     * Uses multiple methods with fallbacks for resilience
     * Returns 0 (neutral) if all methods fail to prevent engine crashes
     */
    private getFundingRate;
    /**
     * Get all active agents with "Safe" strategy
     */
    private getActiveAgents;
    /**
     * Execute strategy for a single agent
     */
    private executeAgentStrategy;
    /**
     * Execute conservative strategy (funding rate arbitrage)
     */
    private executeConservativeStrategy;
    /**
     * Execute aggressive strategy (momentum-based trading)
     */
    private executeAggressiveStrategy;
    /**
     * Get engine status
     */
    getStatus(): {
        isRunning: boolean;
        interval: number;
        fundingThreshold: number;
        minBalance: number;
    };
}
//# sourceMappingURL=engine.d.ts.map