import { ethers } from 'ethers';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
export declare class AgentService {
    /**
     * Creates a new agent for a user if one doesn't exist.
     * Generates a new random wallet, encrypts the private key, and stores it.
     */
    static createAgent(userId: number): Promise<{
        address: string;
        isNew: boolean;
    }>;
    /**
     * Retrieves agent status and checks on-chain balance via Hyperliquid SDK.
     */
    static getAgentStatus(userId: number): Promise<{
        id: number;
        address: string;
        isActive: boolean;
        config: import("@prisma/client/runtime/library").JsonValue;
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
}
//# sourceMappingURL=agentService.d.ts.map