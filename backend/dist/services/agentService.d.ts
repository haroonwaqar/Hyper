import { ethers } from 'ethers';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
export declare class AgentService {
    /**
     * Creates a new agent for a user if one doesn't exist.
     * Generates a new random wallet, encrypts the private key, and stores it.
     * If worldWalletAddress is provided, creates/gets the user first.
     */
    static createAgent(worldWalletAddress: string): Promise<{
        address: string;
        isNew: boolean;
    }>;
    /**
     * Stops an agent by closing all positions and marking as inactive
     */
    static stopAgent(worldWalletAddress: string): Promise<{
        status: string;
        positionsClosed: number;
        totalPositions: number;
    }>;
    /**
     * Retrieves agent status and checks on-chain balance via Hyperliquid SDK.
     */
    static getAgentStatus(worldWalletAddress: string): Promise<{
        id: number;
        address: string;
        isActive: boolean;
        config: any;
        usdcBalance: string;
    } | null>;
    /**
     * Helper to initialize Hyperliquid ExchangeClient with the agent's private key.
     * This is used internally for trading logic.
     */
    static initHyperliquidClient(agentId: number): Promise<ExchangeClient<{
        transport: HttpTransport;
        wallet: ethers.Wallet;
    }>>;
    /**
     * Updates the agent's trading strategy configuration
     */
    static updateStrategy(worldWalletAddress: string, strategyConfig: {
        risk: string;
        leverage: number;
    }): Promise<void>;
    /**
     * Authorizes an agent to trade on behalf of the user
     * PRODUCTION VERSION - Actually broadcasts to Hyperliquid
     */
    static authorizeAgent(signature: string, worldWalletAddress: string, agentAddress: string): Promise<{
        success: boolean;
        message: string;
        agentAddress: string;
    }>;
}
//# sourceMappingURL=agentService.d.ts.map