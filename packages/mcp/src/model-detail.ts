import { z } from 'zod';
import { HfApiCall } from './hf-api-call.js';
import { formatDate, formatNumber, formatBytes, TransformersInfo, SafeTensorsInfo } from './model-utils.js';

// Model Detail Tool Configuration
export const MODEL_DETAIL_TOOL_CONFIG = {
	name: 'model_detail',
	description: 'Get detailed information about a specific model on Hugging Face Hub.',
	schema: z.object({
		model_id: z.string().min(1, 'Model ID is required').describe('Model ID (e.g., microsoft/DialoGPT-large)'),
		include_files: z.boolean().optional().default(false).describe('Include file listing'),
	}),
	annotations: {
		title: 'Model Details',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: false,
	},
} as const;

export type ModelDetailParams = z.infer<typeof MODEL_DETAIL_TOOL_CONFIG.schema>;

// Model Detail Result Interface
export interface ModelDetailResult {
	id: string;
	author?: string;
	downloads?: number;
	downloadsAllTime?: number;
	likes?: number;
	private?: boolean;
	gated?: boolean | string;
	pipeline_tag?: string;
	library_name?: string;
	tags?: string[];
	createdAt?: string;
	lastModified?: string;
	config?: Record<string, any>;
	transformersInfo?: TransformersInfo;
	safetensors?: SafeTensorsInfo;
	cardData?: Record<string, any>;
	inference?: string;
}

// API parameters interface
interface ModelDetailApiParams {
	[key: string]: string;
}

/**
 * Service for getting detailed model information
 */
export class ModelDetailTool extends HfApiCall<ModelDetailApiParams, ModelDetailResult> {
	/**
	 * Creates a new model detail service
	 * @param hfToken Optional Hugging Face token for API access
	 * @param apiUrl The URL of the Hugging Face models API
	 */
	constructor(hfToken?: string, apiUrl = 'https://huggingface.co/api/models') {
		super(apiUrl, hfToken);
	}

	/**
	 * Get detailed information about a specific model
	 *
	 * @param modelId The model ID to get details for (e.g., microsoft/DialoGPT-large)
	 * @param includeFiles Whether to include file listing in the response
	 * @returns Formatted string with model details
	 */
	async getDetails(modelId: string, includeFiles: boolean = false): Promise<string> {
		try {
			const url = new URL(`${this.apiUrl}/${modelId}`);
			if (includeFiles) {
				url.searchParams.append('blobs', 'true');
			}

			const model = await this.fetchFromApi<ModelDetailResult>(url);
			return formatModelDetails(model, includeFiles);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to get model details: ${error.message}`);
			}
			throw error;
		}
	}
}

// Formatting Function
function formatModelDetails(model: ModelDetailResult, includeFiles: boolean): string {
	const r: string[] = [];
	const [author, name] = model.id.includes('/') ? model.id.split('/') : ['', model.id];

	r.push(`# ${model.id}`);
	r.push('');

	// Overview section
	r.push('## Overview');
	if (author) r.push(`- **Author:** ${author}`);
	if (model.pipeline_tag) r.push(`- **Task:** ${model.pipeline_tag}`);
	if (model.library_name) r.push(`- **Library:** ${model.library_name}`);

	const stats = [];
	if (model.downloadsAllTime) stats.push(`**Downloads:** ${formatNumber(model.downloadsAllTime)}`);
	if (model.likes) stats.push(`**Likes:** ${model.likes}`);
	if (stats.length > 0) {
		r.push(`- ${stats.join(' | ')}`);
	}

	if (model.createdAt) r.push(`- **Created:** ${formatDate(model.createdAt)}`);
	if (model.lastModified) r.push(`- **Updated:** ${formatDate(model.lastModified)}`);

	const status = [];
	if (model.gated) status.push('🔒 Gated');
	if (model.private) status.push('🔐 Private');
	if (model.inference) status.push(`🚀 Inference API: ${model.inference}`);
	if (status.length > 0) {
		r.push(`- **Status:** ${status.join(' | ')}`);
	}
	r.push('');

	// Technical Details
	if (model.transformersInfo || model.safetensors || model.config) {
		r.push('## Technical Details');

		if (model.transformersInfo?.auto_model) {
			r.push(`- **Model Class:** ${model.transformersInfo.auto_model}`);
		}

		if (model.safetensors?.total) {
			r.push(`- **Parameters:** ${formatNumber(model.safetensors.total)}`);
		}

		if (model.config) {
			const configKeys = Object.keys(model.config);
			if (configKeys.includes('model_type')) {
				r.push(`- **Architecture:** ${model.config.model_type}`);
			}
			if (configKeys.includes('vocab_size')) {
				r.push(`- **Vocab Size:** ${formatNumber(model.config.vocab_size)}`);
			}
		}
		r.push('');
	}

	// Tags
	if (model.tags && model.tags.length > 0) {
		r.push('## Tags');
		r.push(model.tags.map((tag) => `\`${tag}\``).join(' '));
		r.push('');
	}

	// Files
	if (includeFiles && model.siblings && model.siblings.length > 0) {
		r.push(`## Files (${model.siblings.length} total)`);

		// Sort files by size (largest first)
		const sortedFiles = [...model.siblings].sort((a, b) => (b.size || 0) - (a.size || 0));

		for (const file of sortedFiles.slice(0, 10)) {
			// Show top 10 files
			const size = file.size ? ` (${formatBytes(file.size)})` : '';
			r.push(`- ${file.rfilename}${size}`);
		}

		if (model.siblings.length > 10) {
			r.push(`- *... and ${model.siblings.length - 10} more files*`);
		}
		r.push('');
	}

	// Usage example
	if (model.library_name === 'transformers') {
		r.push('## Usage Example');
		r.push('```python');
		r.push('from transformers import AutoTokenizer, AutoModel');
		r.push(`tokenizer = AutoTokenizer.from_pretrained("${model.id}")`);
		r.push(`model = AutoModel.from_pretrained("${model.id}")`);
		r.push('```');
		r.push('');
	}

	r.push(`**Link:** [https://hf.co/${model.id}](https://hf.co/${model.id})`);

	return r.join('\n');
}
