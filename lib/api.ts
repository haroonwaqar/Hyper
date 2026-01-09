// API Client for HyperWorld Backend
// Base configuration and type definitions

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Type Definitions
export interface CreateAgentResponse {
    success: boolean;
    address: string;
    isNew: boolean;
}

export interface AgentStatus {
    id: number;
    address: string;
    isActive: boolean;
    config: {
        risk: string;
        leverage: number;
    };
    usdcBalance: string;
}

export interface GetAgentStatusResponse {
    success: boolean;
    agent: AgentStatus;
}

export interface StrategyConfig {
    risk: 'Conservative' | 'Moderate' | 'Aggressive';
    leverage: number;
}

export interface UpdateStrategyResponse {
    success: boolean;
    message: string;
}

export interface AuthorizeAgentResponse {
    success: boolean;
    message: string;
    transactionHash?: string;
}

// Error handling wrapper
class APIError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'APIError';
    }
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    console.log(`🌐 API Call: ${options?.method || 'GET'} ${url}`);
    console.log('📦 Payload:', options?.body || 'none');

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        console.log(`📡 Response status: ${response.status}`);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('❌ API Error:', error);
            throw new APIError(response.status, error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ API Success:', data);
        return data;
    } catch (error) {
        console.error('🔴 Network Error:', error);
        if (error instanceof APIError) throw error;
        throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
}

/**
 * Creates a new trading agent for a user
 * @param worldWalletAddress - User's World Chain wallet address
 * @returns Agent address and creation status
 */
export async function createAgent(worldWalletAddress: string): Promise<CreateAgentResponse> {
    return fetchAPI<CreateAgentResponse>('/agent/create', {
        method: 'POST',
        body: JSON.stringify({ worldWalletAddress }),
    });
}

/**
 * Retrieves the current status of a user's agent
 * @param worldWalletAddress - User's World Chain wallet address
 * @returns Agent status including balance and configuration
 */
export async function getAgentStatus(worldWalletAddress: string): Promise<GetAgentStatusResponse> {
    const params = new URLSearchParams({ worldWalletAddress });
    return fetchAPI<GetAgentStatusResponse>(`/agent/status?${params}`);
}

/**
 * Updates the agent's trading strategy
 * @param worldWalletAddress - User's World Chain wallet address
 * @param strategyConfig - Strategy configuration (risk level and leverage)
 * @returns Success status
 */
export async function updateStrategy(
    worldWalletAddress: string,
    strategyConfig: StrategyConfig
): Promise<UpdateStrategyResponse> {
    return fetchAPI<UpdateStrategyResponse>('/agent/strategy', {
        method: 'POST',
        body: JSON.stringify({ worldWalletAddress, strategyConfig }),
    });
}

/**
 * Authorizes the agent on Hyperliquid with signed approval
 * @param signature - EIP-712 signature from MiniKit
 * @param worldWalletAddress - User's World Chain wallet address
 * @param agentAddress - Agent's Hyperliquid address
 * @returns Authorization status and transaction hash
 */
export async function authorizeAgent(
    signature: string,
    worldWalletAddress: string,
    agentAddress: string
): Promise<AuthorizeAgentResponse> {
    return fetchAPI<AuthorizeAgentResponse>('/agent/authorize', {
        method: 'POST',
        body: JSON.stringify({ signature, worldWalletAddress, agentAddress }),
    });
}

/**
 * Polls agent status until it becomes active or times out
 * @param worldWalletAddress - User's World Chain wallet address
 * @param maxAttempts - Maximum number of polling attempts
 * @param intervalMs - Milliseconds between polling attempts
 * @returns Final agent status
 */
export async function pollAgentStatus(
    worldWalletAddress: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000
): Promise<AgentStatus> {
    for (let i = 0; i < maxAttempts; i++) {
        const { agent } = await getAgentStatus(worldWalletAddress);
        if (agent.isActive || parseFloat(agent.usdcBalance) > 0) {
            return agent;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Agent activation timeout');
}
