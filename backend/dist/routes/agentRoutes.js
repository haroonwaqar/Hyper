import { Router } from 'express';
import { AgentService } from '../services/agentService.js';
const router = Router();
// POST /agent/create
router.post('/create', async (req, res) => {
    try {
        console.log('[Route] 📝 Create agent request:', req.body);
        const { worldWalletAddress } = req.body;
        if (!worldWalletAddress) {
            console.log('[Route] ❌ Missing worldWalletAddress');
            res.status(400).json({ error: 'worldWalletAddress is required' });
            return;
        }
        console.log('[Route] 🔄 Calling AgentService.createAgent...');
        const result = await AgentService.createAgent(worldWalletAddress);
        console.log('[Route] ✅ Agent created successfully:', result);
        res.json({
            success: true,
            address: result.address,
            isNew: result.isNew,
        });
    }
    catch (error) {
        console.error('[Route] ❌ ERROR creating agent:');
        console.error('[Route]   Error type:', error instanceof Error ? error.constructor.name : typeof error);
        console.error('[Route]   Error message:', error instanceof Error ? error.message : String(error));
        console.error('[Route]   Stack trace:', error instanceof Error ? error.stack : 'No stack');
        // Return detailed error to frontend for debugging
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error',
            details: error instanceof Error ? error.stack : undefined
        });
    }
});
// GET /agent/status
router.get('/status', async (req, res) => {
    try {
        const worldWalletAddress = req.query.worldWalletAddress;
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
    }
    catch (error) {
        console.error('Error fetching agent status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /agent/stop - Stop agent and close positions
router.post('/stop', async (req, res) => {
    try {
        console.log('[Route] 🛑 Stop agent request:', req.body);
        const { worldWalletAddress } = req.body;
        if (!worldWalletAddress) {
            res.status(400).json({ error: 'worldWalletAddress is required' });
            return;
        }
        const result = await AgentService.stopAgent(worldWalletAddress);
        console.log('[Route] ✅ Agent stopped:', result);
        res.json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        console.error('[Route] ❌ Error stopping agent:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop agent'
        });
    }
});
// POST /agent/strategy - Update agent strategy
router.post('/strategy', async (req, res) => {
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
    }
    catch (error) {
        console.error('Error updating strategy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /agent/authorize
router.post('/authorize', async (req, res) => {
    try {
        const { signature, worldWalletAddress, agentAddress } = req.body;
        if (!signature || !worldWalletAddress || !agentAddress) {
            res.status(400).json({
                error: 'signature, worldWalletAddress, and agentAddress are required'
            });
            return;
        }
        const result = await AgentService.authorizeAgent(signature, worldWalletAddress, agentAddress);
        res.json({
            success: result.success,
            message: result.message,
            agentAddress: result.agentAddress,
        });
    }
    catch (error) {
        console.error('[Route] ❌ Error authorizing agent:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
export default router;
//# sourceMappingURL=agentRoutes.js.map