// Hyperliquid Agent Authorization Helper
// Generates EIP-712 typed data for agent approval

import { ethers } from 'ethers';

export interface HyperliquidAgentPayload {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: `0x${string}`;
    };
    types: {
        Agent: Array<{ name: string; type: string }>;
    };
    primaryType: string;
    message: {
        source: string;
        connectionId: string;
    };
}

/**
 * Generates a unique connection ID for agent authorization
 */
function generateConnectionId(): string {
    return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Creates the EIP-712 typed data payload for Hyperliquid agent approval
 * @param agentAddress - The agent's Ethereum address
 * @param chainId - Chain ID (42161 for Arbitrum One, 421614 for Arbitrum Sepolia)
 * @returns EIP-712 typed data payload
 */
export function createHyperliquidAgentPayload(
    agentAddress: string,
    chainId: number = 42161 // Default to Arbitrum One
): HyperliquidAgentPayload {
    return {
        domain: {
            name: 'Exchange',
            version: '1',
            chainId,
            verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        },
        types: {
            Agent: [
                { name: 'source', type: 'string' },
                { name: 'connectionId', type: 'bytes32' },
            ],
        },
        primaryType: 'Agent',
        message: {
            source: agentAddress,
            connectionId: generateConnectionId(),
        },
    };
}

/**
 * Formats the payload for MiniKit signTypedData command
 * @param agentAddress - The agent's Ethereum address
 * @param chainId - Chain ID
 * @returns Formatted payload ready for MiniKit
 */
export function formatForMiniKit(agentAddress: string, chainId?: number) {
    const payload = createHyperliquidAgentPayload(agentAddress, chainId);

    return {
        domain: payload.domain,
        types: payload.types,
        primaryType: payload.primaryType,
        message: payload.message,
    };
}
