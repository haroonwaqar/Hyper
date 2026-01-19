import 'dotenv/config';
import { prisma } from '../db.js';
import { BridgeService } from '../services/bridgeService.js';

function getArg(name: string): string | null {
    const idx = process.argv.findIndex((arg) => arg === name);
    if (idx === -1) return null;
    return process.argv[idx + 1] ?? null;
}

async function run() {
    const agentAddress = getArg('--agent');
    const minEth = getArg('--minEth');

    const minEthForGasWei =
        minEth && !Number.isNaN(Number(minEth)) ? BigInt(Math.floor(Number(minEth) * 1e18)) : undefined;

    let agents;
    if (agentAddress) {
        const agent = await prisma.agent.findFirst({
            where: { walletAddress: agentAddress },
        });
        if (!agent) {
            throw new Error(`Agent not found for address ${agentAddress}`);
        }
        agents = [agent];
    } else {
        agents = await prisma.agent.findMany();
    }

    console.log(`🔍 Found ${agents.length} agent(s) to sweep.`);

    for (const agent of agents) {
        try {
            const result = await BridgeService.sweepAgentToHyperliquid({
                agentAddress: agent.walletAddress,
                encryptedPrivateKey: agent.encryptedPrivateKey,
                minEthForGasWei,
            });

            if (result.skipped) {
                console.log(
                    `⏭️  ${result.agentAddress} skipped. USDC=${result.usdcBalance} ETH=${result.ethBalance}${
                        result.error ? ` | ${result.error}` : ''
                    }`
                );
                continue;
            }

            console.log(`✅ ${result.agentAddress} swept.`);
            if (result.approveTxHash) console.log(`   Approve: ${result.approveTxHash}`);
            if (result.depositTxHash) console.log(`   Deposit: ${result.depositTxHash} (${result.methodUsed})`);
        } catch (error) {
            console.error(`❌ Failed to sweep ${agent.walletAddress}:`, error);
        }
    }
}

run()
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });

