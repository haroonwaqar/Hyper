import { prisma } from '../db.js';
import { ethers } from 'ethers';
import { encrypt, decrypt } from '../utils/encryption.js';
import { InfoClient, ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';

export class AgentService {
    /**
     * Creates a new agent for a user if one doesn't exist.
     * Generates a new random wallet, encrypts the private key, and stores it.
     * If worldWalletAddress is provided, creates/gets the user first.
     */
    static async createAgent(worldWalletAddress: string) {
        console.log('[AgentService] 🚀 createAgent called for:', worldWalletAddress);

        try {
            // 1. Get or create user
            console.log('[AgentService] 📝 Upserting user...');
            const user = await prisma.user.upsert({
                where: { worldWalletAddress },
                update: {},
                create: { worldWalletAddress },
            });
            console.log('[AgentService] ✅ User upserted, ID:', user.id);

            // 2. Check if agent exists for this user
            console.log('[AgentService] 🔍 Checking for existing agent...');
            const existingAgent = await prisma.agent.findUnique({
                where: { userId: user.id },
            });

            if (existingAgent) {
                console.log('[AgentService] 📦 Found existing agent:', existingAgent.walletAddress);
                return {
                    address: existingAgent.walletAddress,
                    isNew: false,
                };
            }

            // 3. Generate new wallet
            console.log('[AgentService] 🔐 Generating new wallet...');
            const wallet = ethers.Wallet.createRandom();
            const encryptedPrivateKey = encrypt(wallet.privateKey);
            console.log('[AgentService] ✅ Wallet generated:', wallet.address);

            // 4. Store in DB
            console.log('[AgentService] 💾 Creating agent in database...');
            const newAgent = await prisma.agent.create({
                data: {
                    userId: user.id,
                    walletAddress: wallet.address,
                    encryptedPrivateKey,
                    strategyConfig: JSON.stringify({ risk: 'Conservative', leverage: 1 }),
                },
            });
            console.log('[AgentService] ✅ Agent created successfully');

            return {
                address: newAgent.walletAddress,
                isNew: true,
            };
        } catch (error) {
            console.error('[AgentService] ❌ Error in createAgent:');
            console.error('[AgentService]   ', error);
            throw error;
        }
    }

    /**
     * Retrieves agent status and checks on-chain balance via Hyperliquid SDK.
     */
    static async getAgentStatus(worldWalletAddress: string) {
        // Find user by wallet address
        const user = await prisma.user.findUnique({
            where: { worldWalletAddress },
        });

        if (!user) {
            return null;
        }

        const agent = await prisma.agent.findUnique({
            where: { userId: user.id },
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
            const usdc = state.balances.find((b: any) => b.coin === 'USDC');
            usdcBalance = usdc ? usdc.total : '0';
        } catch (error) {
            console.error('Error fetching HL state:', error);
            // It's possible the address has no state on Hyperliquid yet
        }

        return {
            id: agent.id,
            address: agent.walletAddress,
            isActive: agent.isActive,
            config: JSON.parse(agent.strategyConfig),
            usdcBalance,
        };
    }

    /**
     * Helper to initialize Hyperliquid ExchangeClient with the agent's private key.
     * This is used internally for trading logic.
     */
    static async initHyperliquidClient(agentId: number) {
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

    /**
     * Updates the agent's trading strategy configuration
     */
    static async updateStrategy(worldWalletAddress: string, strategyConfig: { risk: string; leverage: number }) {
        // Find user by wallet address
        const user = await prisma.user.findUnique({
            where: { worldWalletAddress },
        });

        if (!user) {
            throw new Error('User not found');
        }

        const agent = await prisma.agent.findUnique({
            where: { userId: user.id },
        });

        if (!agent) {
            throw new Error('Agent not found');
        }

        // Update strategy config
        await prisma.agent.update({
            where: { id: agent.id },
            data: {
                strategyConfig: JSON.stringify(strategyConfig),
            },
        });
    }

    /**
     * Authorizes the agent on Hyperliquid using a pre-signed EIP-712 signature from the frontend
     */
    static async authorizeAgent(signature: string, worldWalletAddress: string, agentAddress: string) {
        // Find user by wallet address
        const user = await prisma.user.findUnique({
            where: { worldWalletAddress },
        });

        if (!user) {
            throw new Error('User not found');
        }

        const agent = await prisma.agent.findUnique({
            where: { userId: user.id },
        });

        if (!agent) {
            throw new Error('Agent not found');
        }

        // Verify the agent address matches
        if (agent.walletAddress.toLowerCase() !== agentAddress.toLowerCase()) {
            throw new Error('Agent address mismatch');
        }

        // For now, we'll store the signature and mark the agent as authorized
        // In a full implementation, you would broadcast this to Hyperliquid
        // The actual approval happens when the user funds the agent and it starts trading

        // TODO: Implement Hyperliquid approval broadcast
        // This would require using the ExchangeClient with the pre-signed signature
        // The SDK would need to support submitting externally signed transactions

        console.log('Agent authorization requested:', {
            agentAddress,
            userAddress: worldWalletAddress,
            signature: signature.substring(0, 20) + '...',
        });

        // Mark agent as active (in production, this would be set after successful blockchain confirmation)
        await prisma.agent.update({
            where: { id: agent.id },
            data: {
                isActive: true,
            },
        });

        return {
            transactionHash: '0x' + '0'.repeat(64), // Placeholder - would be real tx hash from Hyperliquid
        };
    }
}
