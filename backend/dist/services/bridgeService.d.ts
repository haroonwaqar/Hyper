import { ethers } from 'ethers';
export declare const ARBITRUM_RPC_URL: string;
export declare const ARBITRUM_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export declare const HYPERLIQUID_ARBITRUM_BRIDGE: string;
export type BridgeServiceResult = {
    agentAddress: string;
    usdcBalance: bigint;
    ethBalance: bigint;
    approveTxHash?: string;
    depositTxHash?: string;
    methodUsed?: string;
    skipped?: boolean;
    error?: string;
};
export declare class BridgeService {
    static getProvider(): ethers.JsonRpcProvider;
    static getUsdcBalance(address: string, provider?: ethers.JsonRpcProvider): Promise<bigint>;
    static getEthBalance(address: string, provider?: ethers.JsonRpcProvider): Promise<bigint>;
    static ensureAllowance(wallet: ethers.Wallet, spender: string, amount: bigint): Promise<string | null>;
    static depositToHyperliquid(wallet: ethers.Wallet, amount: bigint): Promise<{
        txHash: string;
        methodUsed: string;
    }>;
    static sweepAgentToHyperliquid(params: {
        agentAddress: string;
        encryptedPrivateKey: string;
        minEthForGasWei?: bigint;
    }): Promise<BridgeServiceResult>;
}
//# sourceMappingURL=bridgeService.d.ts.map