import { WebSocket, WebSocketServer } from 'ws';
import * as jwt from 'jsonwebtoken';

const SECRET_KEY = 'your-256-bit-secret';

async function test() {
    console.log('Starting Gateway Test...');

    // 1. Mock Backend Server (Cell)
    const mockBackend = new WebSocketServer({ port: 9222 });
    mockBackend.on('connection', (ws) => {
        console.log('[Mock Backend] Connected');
        ws.on('message', (msg) => {
            console.log(`[Mock Backend] Received: ${msg}`);
            // Echo back with a simulated Target.targetCreated
            ws.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: { targetId: '123' } } }));
        });
    });

    // 2. Start Gateway
    // We'll run it in a separate process or just import it if it didn't listen on its own
    // Since gateway.ts runs on start, we should probably run it in the background
    const gatewayProcess = Bun.spawn(['bun', 'run', 'src/gateway.ts'], {
        env: { ...process.env, GATEWAY_SECRET: SECRET_KEY },
        stdout: 'inherit',
        stderr: 'inherit'
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for gateway to start

    // 3. Client Connection
    const token = jwt.sign({ user: 'test-user' }, SECRET_KEY);
    const client = new WebSocket(`ws://localhost:3000?token=sk_live_${token}`);

    client.on('open', () => {
        console.log('[Client] Connected to Gateway');
        client.send(JSON.stringify({ method: 'Page.navigate', params: { url: 'https://example.com' } }));
    });

    client.on('message', (data) => {
        console.log(`[Client] Received: ${data}`);
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Target.targetCreated') {
            console.log('SUCCESS: Intercepted message received by client');
            finish();
        }
    });

    client.on('error', (err) => console.error('[Client] Error', err));

    let finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        console.log('Test Finished');
        client.close();
        mockBackend.close();
        gatewayProcess.kill();
        process.exit(0);
    }

    setTimeout(() => {
        console.error('Test Timed Out');
        finish();
        process.exit(1);
    }, 10000);
}

test();
