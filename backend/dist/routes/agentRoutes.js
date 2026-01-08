import { Router } from 'express';
import { AgentService } from '../services/agentService.js';
const router = Router();
// POST /agent/create
router.post('/create', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }
        const result = await AgentService.createAgent(userId);
        res.json({
            success: true,
            address: result.address,
            isNew: result.isNew,
        });
    }
    catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /agent/status
router.get('/status', async (req, res) => {
    try {
        // Assuming userId is passed as a query param for simplicity, 
        // or you could extract from auth middleware
        const userId = Number(req.query.userId);
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }
        const status = await AgentService.getAgentStatus(userId);
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
export default router;
//# sourceMappingURL=agentRoutes.js.map