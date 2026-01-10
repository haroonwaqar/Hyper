// Global App Context for HyperWorld
// Manages user authentication, agent state, and wallet balances

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';
import { createAgent, getAgentStatus, updateStrategy, type AgentStatus } from '@/lib/api';

interface AppContextType {
    // User & Auth
    userAddress: string | null;
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    authError: string | null;
    signIn: () => Promise<void>;

    // Agent
    agent: AgentStatus | null;
    agentLoading: boolean;
    agentError: string | null;
    hasAgent: boolean;
    createUserAgent: (strategy: 'Conservative' | 'Moderate' | 'Aggressive') => Promise<void>;
    refreshAgent: () => Promise<void>;

    // Balances
    worldChainBalance: string | null;
    hyperliquidBalance: string | null;
    refreshBalances: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    const [agent, setAgent] = useState<AgentStatus | null>(null);
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentError, setAgentError] = useState<string | null>(null);

    const [worldChainBalance, setWorldChainBalance] = useState<string | null>(null);
    const [hyperliquidBalance, setHyperliquidBalance] = useState<string | null>(null);

    // Initialize MiniKit and authenticate on mount
    useEffect(() => {
        initializeAuth();
    }, []);

    // Check for agent when user is authenticated
    useEffect(() => {
        if (isAuthenticated && userAddress) {
            checkForAgent();
            fetchWorldChainBalance();
        }
    }, [isAuthenticated, userAddress]);

    async function testAPIConnection() {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        console.log('🔍 Testing API connection to:', apiUrl);

        try {
            const response = await fetch(`${apiUrl}/health`);
            const data = await response.json();
            console.log('✅ Backend is reachable:', data);
        } catch (error) {
            console.error('❌ Backend connection failed!');
            console.error('   API URL:', apiUrl);
            console.error('   Error:', error);
            console.error('   → Make sure backend is running on port 3001');
            console.error('   → Check .env.local has NEXT_PUBLIC_API_URL=http://localhost:3001');
        }
    }

    async function initializeAuth() {
        try {
            setIsAuthenticating(true);
            setAuthError(null);

            // Check localStorage first
            const stored = localStorage.getItem('hyperworld_user');
            if (stored) {
                const data = JSON.parse(stored);
                console.log('📱 Restored user from localStorage:', data.address);
                setUserAddress(data.address);
                setIsAuthenticated(true);
                setIsAuthenticating(false);
                return;
            }

            // Install MiniKit
            const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
            console.log('🔧 MiniKit App ID:', appId || 'NOT SET');

            if (!appId) {
                console.warn('⚠️ NEXT_PUBLIC_WLD_APP_ID not configured - using test mode');
                // For testing without MiniKit
                const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5';
                setUserAddress(testAddress);
                setIsAuthenticated(true);
                setIsAuthenticating(false);
                localStorage.setItem('hyperworld_user', JSON.stringify({ address: testAddress }));
                return;
            }

            MiniKit.install(appId);

            if (!MiniKit.isInstalled()) {
                setAuthError('Please open this app in World App');
                setIsAuthenticating(false);
                return;
            }

            // Auto-authenticate
            const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
                nonce: crypto.randomUUID(),
                statement: 'Sign in to HyperWorld',
                requestId: 'hyperworld-auth',
            });

            if (finalPayload.status === 'success') {
                const address = finalPayload.address;
                setUserAddress(address);
                setIsAuthenticated(true);
                localStorage.setItem('hyperworld_user', JSON.stringify({ address }));
            } else {
                throw new Error(finalPayload.error_code || 'Authentication failed');
            }
        } catch (error) {
            console.error('Auth error:', error);
            setAuthError(error instanceof Error ? error.message : 'Authentication failed');
        } finally {
            setIsAuthenticating(false);
        }
    }

    async function signIn() {
        await initializeAuth();
    }

    async function checkForAgent() {
        if (!userAddress) return;

        try {
            setAgentLoading(true);
            setAgentError(null);

            const response = await getAgentStatus(userAddress);
            setAgent(response.agent);
            setHyperliquidBalance(response.agent.usdcBalance);
        } catch (error) {
            // No agent exists yet - this is expected for new users
            console.log('No agent found:', error);
            setAgent(null);
        } finally {
            setAgentLoading(false);
        }
    }

    async function createUserAgent(strategy: 'Conservative' | 'Moderate' | 'Aggressive') {
        if (!userAddress) throw new Error('Not authenticated');

        try {
            console.log('[AppContext] 🚀 Starting agent creation...');
            console.log('[AppContext] User address:', userAddress);
            console.log('[AppContext] Strategy:', strategy);

            setAgentLoading(true);
            setAgentError(null);

            // Create agent
            console.log('[AppContext] 📝 Calling createAgent API...');
            const result = await createAgent(userAddress);
            console.log('[AppContext] ✅ Agent created:', result);

            // Set strategy
            const leverage = strategy === 'Aggressive' ? 3 : strategy === 'Moderate' ? 2 : 1;
            console.log('[AppContext] ⚙️  Setting strategy:', { risk: strategy, leverage });

            try {
                await updateStrategy(userAddress, { risk: strategy, leverage });
                console.log('[AppContext] ✅ Strategy updated');
            } catch (stratError) {
                console.warn('[AppContext] ⚠️  Strategy update failed (non-critical):', stratError);
                // Don't fail the whole flow if strategy update fails
            }

            // Refresh agent data in background (don't wait for it)
            console.log('[AppContext] 🔄 Refreshing agent data in background...');
            checkForAgent().catch(e => console.warn('[AppContext] Background refresh failed:', e));

            console.log('[AppContext] ✅ Agent creation complete!');

            // Return success - don't throw errors
            return;
        } catch (error) {
            console.error('[AppContext] ❌ Error creating agent:');
            console.error('[AppContext]   ', error);
            const message = error instanceof Error ? error.message : 'Failed to create agent';
            setAgentError(message);
            throw error;
        } finally {
            setAgentLoading(false);
        }
    }

    async function refreshAgent() {
        await checkForAgent();
    }

    async function fetchWorldChainBalance() {
        if (!userAddress) return;

        try {
            // Fetch World Chain USDC balance via RPC
            const WORLDCHAIN_USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
            const WORLDCHAIN_RPC = 'https://worldchain-mainnet.g.alchemy.com/public';

            const balanceOfData = `0x70a08231000000000000000000000000${userAddress.slice(2)}`;

            const response = await fetch(WORLDCHAIN_RPC, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_call',
                    params: [
                        { to: WORLDCHAIN_USDC, data: balanceOfData },
                        'latest'
                    ],
                }),
            });

            const json = await response.json();
            if (json.result) {
                const balance = BigInt(json.result);
                const balanceUsdc = (Number(balance) / 1e6).toFixed(2);
                setWorldChainBalance(balanceUsdc);
            }
        } catch (error) {
            console.error('Failed to fetch World Chain balance:', error);
        }
    }

    async function refreshBalances() {
        await Promise.all([
            fetchWorldChainBalance(),
            checkForAgent(), // This also updates Hyperliquid balance
        ]);
    }

    const value: AppContextType = {
        userAddress,
        isAuthenticated,
        isAuthenticating,
        authError,
        signIn,
        agent,
        agentLoading,
        agentError,
        hasAgent: agent !== null,
        createUserAgent,
        refreshAgent,
        worldChainBalance,
        hyperliquidBalance,
        refreshBalances,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
