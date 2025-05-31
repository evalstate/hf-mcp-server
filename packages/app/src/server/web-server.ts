import express, { type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { TransportType } from '../shared/constants.js';
import type { ToolSettings } from '../shared/settings.js';
import { settingsService } from '../shared/settings.js';
import { logger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TransportInfo {
    transport: TransportType;
    hfTokenStatus: 'present' | 'missing';
    port?: number;
    jsonResponse?: boolean;
    clientInfo?: {
        name: string;
        version: string;
    };
}

export interface RegisteredTool {
    enable: () => void;
    disable: () => void;
    remove: () => void;
}

export class WebServer {
    private app: Express;
    private server: Server | null = null;
    private activeTransport: TransportType = 'unknown';
    private activePort: number | undefined = undefined;
    private activeClientInfo: { name: string; version: string } | null = null;
    private registeredTools: { [toolId: string]: RegisteredTool } = {};

    constructor() {
        this.app = express() as Express;
        this.setupMiddleware();
    }

    private setupMiddleware(): void {
        this.app.use(express.json());
    }

    private maskToken(token: string): string {
        if (!token || token.length <= 9) return token;
        return `${token.substring(0, 4)}...${token.substring(token.length - 5)}`;
    }

    private getHfToken(): string | undefined {
        return process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;
    }

    public getApp(): Express {
        return this.app;
    }

    public setTransportInfo(transport: TransportType, port?: number): void {
        this.activeTransport = transport;
        this.activePort = port;
    }

    public setClientInfo(clientInfo: { name: string; version: string } | null): void {
        this.activeClientInfo = clientInfo;
    }

    public setRegisteredTools(tools: { [toolId: string]: RegisteredTool }): void {
        this.registeredTools = tools;
    }

    public getTransportInfo(): TransportInfo {
        return {
            transport: this.activeTransport,
            hfTokenStatus: process.env.HF_TOKEN ? 'present' : 'missing',
            port: this.activePort,
            clientInfo: this.activeClientInfo || undefined
        };
    }

    public async start(port: number): Promise<void> {
        if (this.server) {
            throw new Error('Server is already running');
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(port, () => {
                this.activePort = port;
                resolve();
            }).on('error', reject);
        });
    }

    public async stop(): Promise<void> {
        if (!this.server) {
            return;
        }

        return new Promise((resolve, reject) => {
            this.server?.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    this.server = null;
                    resolve();
                }
            });
        });
    }

    public async setupStaticFiles(isDevelopment: boolean): Promise<void> {
        if (isDevelopment) {
            // In development mode, use Vite's dev server middleware
            try {
                const { createServer: createViteServer } = await import('vite');
                const rootDir = path.resolve(__dirname, '..', '..', '..', 'app', 'src', 'web');
                
                // Create Vite server with proper HMR configuration
                const vite = await createViteServer({
                    configFile: path.resolve(__dirname, '..', '..', '..', 'app', 'vite.config.ts'),
                    server: {
                        middlewareMode: true,
                        hmr: true, // Explicitly enable HMR
                    },
                    appType: 'spa',
                    root: rootDir,
                });

                // Use Vite's middleware for dev server with HMR
                this.app.use(vite.middlewares);

                logger.info('Using Vite middleware in development mode with HMR enabled');
                logger.info({ rootDir }, 'Vite root directory');
            } catch (err) {
                logger.error({ err }, 'Error setting up Vite middleware');
                throw err;
            }
        } else {
            // In production, serve static files
            const staticPath = path.join(__dirname, '..', 'web');
            this.app.use(express.static(staticPath));
            
            // Fallback to index.html for SPA routing
            this.app.get('*', (req, res) => {
                if (!req.path.startsWith('/api/')) {
                    res.sendFile(path.join(staticPath, 'index.html'));
                }
            });
        }
    }

    public setupApiRoutes(): void {
        // Transport info endpoint
        this.app.get('/api/transport', (req, res) => {
            const hfToken = this.getHfToken();

            // Define the type for transport info with all possible properties
            interface TransportInfoResponse {
                transport: TransportType;
                hfTokenSet: boolean;
                hfTokenMasked?: string;
                port?: number;
                jsonResponseEnabled?: boolean;
                stdioClient?: {
                    name: string;
                    version: string;
                } | null;
            }

            const transportInfo: TransportInfoResponse = {
                transport: this.activeTransport,
                hfTokenSet: !!hfToken,
            };

            if (hfToken) {
                transportInfo.hfTokenMasked = this.maskToken(hfToken);
            }

            // Set port information for all transports (web app always runs on this port)
            if (this.activePort) {
                transportInfo.port = this.activePort;
            }

            // Add JSON response mode info for streamableHttpJson transport type
            if (this.activeTransport === 'streamableHttpJson') {
                transportInfo.jsonResponseEnabled = true;
            }

            // Add STDIO client info
            if (this.activeTransport === 'stdio') {
                transportInfo.stdioClient = this.activeClientInfo;
            }

            res.json(transportInfo);
        });

        // Settings endpoint
        this.app.get('/api/settings', (req, res) => {
            res.json(settingsService.getSettings());
        });

        // Update tool settings endpoint
        this.app.post('/api/settings/tools/:toolId', express.json(), (req, res) => {
            const { toolId } = req.params;
            const settings = req.body as Partial<ToolSettings>;
            const updatedSettings = settingsService.updateToolSettings(toolId, settings);

            // Enable or disable the actual MCP tool if it exists
            if (this.registeredTools[toolId]) {
                if (settings.enabled) {
                    this.registeredTools[toolId].enable();
                    logger.info(`Tool ${toolId} has been enabled via API`);
                } else {
                    this.registeredTools[toolId].disable();
                    logger.info(`Tool ${toolId} has been disabled via API`);
                }
            }

            res.json(updatedSettings);
        });
    }
}