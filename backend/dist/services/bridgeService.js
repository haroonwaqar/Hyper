import { ethers, getAddress } from 'ethers';
import { decrypt } from '../utils/encryption.js';
export const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
export const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const HYPERLIQUID_ARBITRUM_BRIDGE = getAddress('0x2df1c51e09aecf9cacb7bc98cb1742757f163df7');
const ERC20_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
];
const HYPERLIQUID_BRIDGE_ABI = [
    'function bridgeUsdc(uint256 amount) external',
    'function deposit(uint256 amount) external',
    'function depositUSDC(uint256 amount) external',
];
export class BridgeService {
    static getProvider() {
        return new ethers.JsonRpcProvider(ARBITRUM_RPC_URL);
    }
    static async getUsdcBalance(address, provider) {
        const p = provider ?? this.getProvider();
        const usdc = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, p);
        return await usdc.balanceOf(address);
    }
    static async getEthBalance(address, provider) {
        const p = provider ?? this.getProvider();
        return await p.getBalance(address);
    }
    static async ensureAllowance(wallet, spender, amount) {
        const usdc = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, wallet);
        const current = await usdc.allowance(wallet.address, spender);
        if (current >= amount)
            return null;
        const tx = await usdc.approve(spender, amount);
        const receipt = await tx.wait();
        return receipt?.hash ?? tx.hash;
    }
    static async depositToHyperliquid(wallet, amount) {
        const bridge = new ethers.Contract(HYPERLIQUID_ARBITRUM_BRIDGE, HYPERLIQUID_BRIDGE_ABI, wallet);
        const methods = ['bridgeUsdc', 'deposit', 'depositUSDC'];
        let lastError = null;
        for (const method of methods) {
            try {
                const fn = bridge[method];
                if (typeof fn !== 'function')
                    continue;
                const tx = await fn(amount);
                const receipt = await tx.wait();
                return { txHash: receipt?.hash ?? tx.hash, methodUsed: method };
            }
            catch (error) {
                lastError = error;
            }
        }
        // Fallback: direct USDC transfer to the bridge contract.
        try {
            const usdc = new ethers.Contract(ARBITRUM_USDC, ERC20_ABI, wallet);
            const tx = await usdc.transfer(HYPERLIQUID_ARBITRUM_BRIDGE, amount);
            const receipt = await tx.wait();
            return { txHash: receipt?.hash ?? tx.hash, methodUsed: 'transfer' };
        }
        catch (error) {
            lastError = error;
        }
        throw new Error(`Failed to deposit via bridge contract. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
    static async sweepAgentToHyperliquid(params) {
        const provider = this.getProvider();
        const privateKey = decrypt(params.encryptedPrivateKey);
        const wallet = new ethers.Wallet(privateKey, provider);
        const usdcBalance = await this.getUsdcBalance(params.agentAddress, provider);
        const ethBalance = await this.getEthBalance(params.agentAddress, provider);
        if (usdcBalance <= 0n) {
            return { agentAddress: params.agentAddress, usdcBalance, ethBalance, skipped: true };
        }
        const minEth = params.minEthForGasWei ?? ethers.parseEther('0.0001');
        if (ethBalance < minEth) {
            return {
                agentAddress: params.agentAddress,
                usdcBalance,
                ethBalance,
                skipped: true,
                error: `TRAPPED_FUNDS: ${params.agentAddress} has ${ethers.formatEther(ethBalance)} ETH on Arbitrum. Send at least ${ethers.formatEther(minEth)} ETH.`,
            };
        }
        const approveTxHash = await this.ensureAllowance(wallet, HYPERLIQUID_ARBITRUM_BRIDGE, usdcBalance);
        const { txHash, methodUsed } = await this.depositToHyperliquid(wallet, usdcBalance);
        const result = {
            agentAddress: params.agentAddress,
            usdcBalance,
            ethBalance,
            depositTxHash: txHash,
            methodUsed,
        };
        if (approveTxHash) {
            result.approveTxHash = approveTxHash;
        }
        return result;
    }
}
//# sourceMappingURL=bridgeService.js.map