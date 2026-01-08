import { Router } from 'express';
import type { Request, Response } from 'express';
import { AgentService } from '../services/agentService.js';

const router = Router();

// POST /agent/create
router.post('/create', async (req: Request, res: Response): Promise<void> => {
    try {
        const { worldWalletAddress } = req.body;

        if (!worldWalletAddress) {
            res.status(400).json({ error: 'worldWalletAddress is required' });
            return;
        }

        const result = await AgentService.createAgent(worldWalletAddress);
        res.json({
            success: true,
            address: result.address,
            isNew: result.isNew,
        });
    } catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /agent/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const worldWalletAddress = req.query.worldWalletAddress as string;

        if (!worldWalletAddress) {
            res.status(400).json({ error: 'worldWalletAddress is required' });
            return;
        }

        const status = await AgentService.getAgentStatus(worldWalletAddress);

        if (!status) {
            res.status(404).json({ error: 'Agent not found' });
            return;
        }

        res.json({
            success: true,
            agent: status
        });

    } catch (error) {
        console.error('Error fetching agent status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /agent/strategy
router.post('/strategy', async (req: Request, res: Response): Promise<void> => {
    try {
        const { worldWalletAddress, strategyConfig } = req.body;

        if (!worldWalletAddress || !strategyConfig) {
            res.status(400).json({ error: 'worldWalletAddress and strategyConfig are required' });
            return;
        }

        await AgentService.updateStrategy(worldWalletAddress, strategyConfig);

        res.json({
            success: true,
            message: 'Strategy updated successfully'
        });
    } catch (error) {
        console.error('Error updating strategy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /agent/authorize
router.post('/authorize', async (req: Request, res: Response): Promise<void> => {
    try {
        const { signature, worldWalletAddress, agentAddress } = req.body;

        if (!signature || !worldWalletAddress || !agentAddress) {
            res.status(400).json({
                error: 'signature, worldWalletAddress, and agentAddress are required'
            });
            return;
        }

        const result = await AgentService.authorizeAgent(
            signature,
            worldWalletAddress,
            agentAddress
        );

        res.json({
            success: true,
            message: 'Agent authorized successfully',
            transactionHash: result.transactionHash
        });
    } catch (error) {
        console.error('Error authorizing agent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
