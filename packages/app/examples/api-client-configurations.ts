/**
 * Examples of different ApiClient configurations for various use cases
 */

import type { ApiClientConfig, GradioEndpoint } from '../src/server/lib/mcp-api-client.js';

export const localPollingConfig: ApiClientConfig = {
	type: 'polling',
	baseUrl: 'http://localhost:3001',
	pollInterval: 5000, // 5 seconds
};

export const externalApiConfig: ApiClientConfig = {
	type: 'external',
	externalUrl: 'https://api.huggingface.co/v1/mcp/settings',
	pollInterval: 30000, // 30 seconds for external API
};

/*
// Or for local development:
const app = new Application({
	transportType: 'streamableHttp',
	webAppPort: 3001,
	webServerInstance: webServer,
	apiClientConfig: localPollingConfig, // Polls local web interface
});

// Or for production:
const app = new Application({
	transportType: 'streamableHttp',
	webAppPort: 3001,
	webServerInstance: webServer,
	apiClientConfig: externalApiConfig, // Uses external API with HF token
});
*/
