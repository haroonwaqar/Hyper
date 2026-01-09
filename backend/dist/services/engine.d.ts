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
     * Get current funding rate for a coin
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