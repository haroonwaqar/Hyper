// Test endpoint to verify deployment and database
router.get('/test', async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Test] Endpoint hit');

        // Test 1: Basic response
        const tests: any = {
            server: 'OK',
            timestamp: new Date().toISOString(),
        };

        // Test 2: Check Prisma
        try {
            await prisma.$connect();
            tests.database = 'Connected';
        } catch (e) {
            tests.database = 'Failed: ' + (e instanceof Error ? e.message : String(e));
        }

        // Test 3: Check encryption
        try {
            const testEncrypt = encrypt('test');
            const testDecrypt = decrypt(testEncrypt);
            tests.encryption = testDecrypt === 'test' ? 'OK' : 'Failed';
        } catch (e) {
            tests.encryption = 'Failed: ' + (e instanceof Error ? e.message : String(e));
        }

        res.json(tests);
    } catch (error) {
        console.error('[Test] Error:', error);
        res.status(500).json({ error: String(error) });
    }
});
