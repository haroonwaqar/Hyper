import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { encrypt, decrypt } from '../utils/encryption.js';
import { InfoClient, ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
const prisma = new PrismaClient();
export class AgentService {
    /**
     * Creates a new agent for a user if one doesn't exist.
     * Generates a new random wallet, encrypts the private key, and stores it.
     */
    static async createAgent(userId) {
        // 1. Check if agent exists
        const existingAgent = await prisma.agent.findUnique({
            where: { userId },
        });
        if (existingAgent) {
            return {
                address: existingAgent.walletAddress,
                isNew: false,
            };
        }
        // 2. Generate new wallet
        const wallet = ethers.Wallet.createRandom();
        const encryptedPrivateKey = encrypt(wallet.privateKey);
        // 3. Store in DB
        const newAgent = await prisma.agent.create({
            data: {
                userId,
                walletAddress: wallet.address,
                encryptedPrivateKey,
                strategyConfig: { risk: 'Conservative', leverage: 1 },
            },
        });
        return {
            address: newAgent.walletAddress,
            isNew: true,
        };
    }
    /**
     * Retrieves agent status and checks on-chain balance via Hyperliquid SDK.
     */
    static async getAgentStatus(userId) {
        const agent = await prisma.agent.findUnique({
            where: { userId },
        });
        if (!agent) {
            return null;
        }
        // Initialize InfoClient for reading state
        const transport = new HttpTransport(); // Defaults to Mainnet
        const infoClient = new InfoClient({ transport });
        // Fetch USDC Balance (Spot)
        let usdcBalance = '0';
        try {
            const state = await infoClient.spotClearinghouseState({ user: agent.walletAddress });
            const usdc = state.balances.find((b) => b.coin === 'USDC');
            usdcBalance = usdc ? usdc.total : '0';
        }
        catch (error) {
            console.error('Error fetching HL state:', error);
            // It's possible the address has no state on Hyperliquid yet
        }
        return {
            id: agent.id,
            address: agent.walletAddress,
            isActive: agent.isActive,
            config: agent.strategyConfig,
            usdcBalance,
        };
    }
    /**
     * Helper to initialize Hyperliquid ExchangeClient with the agent's private key.
     * This is used internally for trading logic.
     */
    static async initHyperliquidClient(agentId) {
        const agent = await prisma.agent.findUniqueOrThrow({
            where: { id: agentId },
        });
        const privateKey = decrypt(agent.encryptedPrivateKey);
        const wallet = new ethers.Wallet(privateKey);
        const transport = new HttpTransport();
        // Initialize ExchangeClient
        const client = new ExchangeClient({
            transport,
            wallet,
        });
        return client;
    }
}
//# sourceMappingURL=agentService.js.map