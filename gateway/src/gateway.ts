import { WebSocketServer, WebSocket } from 'ws';
import * as jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import { parse } from 'url';

const PORT = 3000;
const SECRET_KEY = process.env.GATEWAY_SECRET || 'your-256-bit-secret';

interface BrowserCell {
    id: string;
    address: string; // e.g., '127.0.0.1:9222'
    isIdle: boolean;
}

// Simple Connection Router / Registry
class ConnectionRouter {
    private cells: BrowserCell[] = [];

    constructor() {
        // In a real scenario, these might be discovered dynamically
        // For demonstration, we assume cells are reachable at these addresses
        this.cells = [
            { id: 'cell-1', address: '127.0.0.1:9222', isIdle: true },
            { id: 'cell-2', address: '127.0.0.1:9223', isIdle: true },
        ];
    }

    acquireIdleCell(): BrowserCell | null {
        const cell = this.cells.find(c => c.isIdle);
        if (cell) {
            cell.isIdle = false;
            return cell;
        }
        return null;
    }

    releaseCell(id: string) {
        const cell = this.cells.find(c => c.id === id);
        if (cell) {
            cell.isIdle = true;
        }
    }
}

const router = new ConnectionRouter();

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket Gateway started on port ${PORT}`);

wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    const startTime = performance.now();

    // 1. Authentication Layer
    const query = parse(req.url || '', true).query;
    const token = query.token as string;

    if (!token || !token.startsWith('sk_live_')) {
        console.error('Missing or invalid token prefix');
        clientWs.close(1008, 'Unauthorized: Missing or invalid token prefix');
        return;
    }

    // Stripping the prefix to validate the actual JWT part
    const jwtPart = token.replace('sk_live_', '');
    try {
        jwt.verify(jwtPart, SECRET_KEY);
    } catch (err) {
        console.error('JWT validation failed', err);
        clientWs.close(1008, 'Unauthorized: Invalid JWT');
        return;
    }

    // 2. Routing
    const cell = router.acquireIdleCell();
    if (!cell) {
        console.error('No idle browser cells available');
        clientWs.close(1013, 'Try Again Later: No idle capacity');
        return;
    }

    console.log(`Mapping connection to cell ${cell.id} at ${cell.address}`);

    // 3. Backend Connection
    const backendWs = new WebSocket(`ws://${cell.address}`);

    // Buffering messages if backend is not yet open
    const buffer: any[] = [];
    let backendOpen = false;

    backendWs.on('open', () => {
        backendOpen = true;
        while (buffer.length > 0) {
            backendWs.send(buffer.shift());
        }
    });

    // 4. Bi-directional Frame Passing with Interception
    clientWs.on('message', (data) => {
        if (!backendOpen) {
            buffer.push(data);
        } else {
            backendWs.send(data);
        }
    });

    backendWs.on('message', (data) => {
        // Message Interception
        try {
            const message = JSON.parse(data.toString());
            if (message.method === 'Target.targetCreated') {
                console.log('Intercepted Target.targetCreated');
                // Transparently passing it, but we could act here
            }
        } catch (e) {
            // Non-JSON or malformed CDP frame, ignore and pass through
        }

        clientWs.send(data);
    });

    // Error & Close handling
    const cleanup = () => {
        console.log(`Closing connection for cell ${cell.id}`);
        router.releaseCell(cell.id);
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        if (backendWs.readyState === WebSocket.OPEN) backendWs.close();
    };

    clientWs.on('close', cleanup);
    backendWs.on('close', cleanup);
    clientWs.on('error', (err) => { console.error('Client WS Error', err); cleanup(); });
    backendWs.on('error', (err) => { console.error('Backend WS Error', err); cleanup(); });

    const setupTime = performance.now() - startTime;
    console.log(`Connection setup took ${setupTime.toFixed(2)}ms`);
});
