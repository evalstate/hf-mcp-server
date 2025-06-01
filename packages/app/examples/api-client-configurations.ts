/**
 * Examples of different ApiClient configurations for various use cases
 */

import type { ApiClientConfig, GradioEndpoint } from '../src/server/lib/mcp-api-client.js';

// 1. Static configuration for testing
export const staticTestConfig: ApiClientConfig = {
	type: 'static',
	staticSettings: {
		huggingface_spaces_search: true,
		huggingface_model_search: true,
		huggingface_model_detail: false, // Disabled for testing
		huggingface_paper_search: true,
		huggingface_dataset_search: false, // Disabled for testing
		huggingface_dataset_detail: true,
	},
	staticGradioEndpoints: [
		{
			name: 'Text Generation',
			url: 'https://huggingface.co/spaces/huggingface/text-generation-inference',
			description: 'High-performance text generation API',
		},
		{
			name: 'Image Classification',
			url: 'https://huggingface.co/spaces/huggingface/image-classification',
			description: 'Classify images using various models',
		},
	],
};

// 2. Local polling configuration (current default behavior)
export const localPollingConfig: ApiClientConfig = {
	type: 'polling',
	baseUrl: 'http://localhost:3001',
	pollInterval: 5000, // 5 seconds
};

// 3. External API configuration for production use
export const externalApiConfig: ApiClientConfig = {
	type: 'external',
	externalUrl: 'https://api.huggingface.co/v1/mcp/settings',
	pollInterval: 30000, // 30 seconds for external API
};

// Example usage in Application constructor:
/*
const app = new Application({
	transportType: 'stdio',
	webAppPort: 3001,
	webServerInstance: webServer,
	apiClientConfig: staticTestConfig, // Use static config for testing
});

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
