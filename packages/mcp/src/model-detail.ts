import { z } from 'zod';
import { modelInfo, type ModelEntry } from '@huggingface/hub';
import {
	formatDate,
	formatNumber,
	formatBytes,
	TransformersInfo,
	SafeTensorsInfo,
	RepoSibling,
} from './model-utils.js';

// Model Detail Tool Configuration
export const MODEL_DETAIL_TOOL_CONFIG = {
	name: 'model_detail',
	description: 'Get detailed information about a specific model on Hugging Face Hub.',
	schema: z.object({
		model_id: z.string().min(1, 'Model ID is required').describe('Model ID (e.g., microsoft/DialoGPT-large)'),
	}),
	annotations: {
		title: 'Model Details',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: false,
	},
} as const;

export type ModelDetailParams = z.infer<typeof MODEL_DETAIL_TOOL_CONFIG.schema>;

// Extended model entry interface with additional fields
interface ExtendedModelEntry extends ModelEntry {
	author?: string;
	downloadsAllTime?: number;
	library_name?: string;
	tags?: string[];
	createdAt?: string; // Keep as string since hub library returns string
	config?: Record<string, any>;
	transformersInfo?: TransformersInfo;
	safetensors?: SafeTensorsInfo;
	siblings?: RepoSibling[];
	cardData?: Record<string, any>;
	inference?: string;
	pipeline_tag?: string;
	'model-index'?: Array<{
		name: string;
		results: Array<{
			task: {
				type: string;
				name: string;
			};
			dataset: {
				name: string;
				type: string;
			};
			metrics: Array<{
				type: string;
				value: number;
				name: string;
			}>;
		}>;
	}>;
	spaces?: Array<{
		id: string;
		name: string;
		title?: string;
	}>;
}

/**
 * Service for getting detailed model information using the official huggingface.js library
 */
export class ModelDetailTool {
	private readonly hubUrl?: string;
	private readonly accessToken?: string;

	/**
	 * Creates a new model detail service
	 * @param hfToken Optional Hugging Face token for API access
	 * @param hubUrl Optional custom hub URL
	 */
	constructor(hfToken?: string, hubUrl?: string) {
		this.accessToken = hfToken;
		this.hubUrl = hubUrl;
	}

	/**
	 * Get detailed information about a specific model
	 *
	 * @param modelId The model ID to get details for (e.g., microsoft/DialoGPT-large)
	 * @returns Formatted string with model details
	 */
	async getDetails(modelId: string): Promise<string> {
		try {
			// Define additional fields we want to retrieve (only those available in the hub library)
			const additionalFields: Array<
				| 'author'
				| 'downloadsAllTime'
				| 'library_name'
				| 'tags'
				| 'config'
				| 'transformersInfo'
				| 'safetensors'
				| 'cardData'
				| 'model-index'
				| 'spaces'
			> = [
				'author',
				'downloadsAllTime',
				'library_name',
				'tags',
				'config',
				'transformersInfo',
				'safetensors',
				'cardData',
				'model-index',
				'spaces',
			];

			const model = await modelInfo({
				name: modelId,
				additionalFields,
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
				...(this.hubUrl && { hubUrl: this.hubUrl }),
			});

			// Cast model-index and spaces to their expected types
			const modelWithExtras: ExtendedModelEntry = {
				...model,
				pipeline_tag: model.task,
				id: modelId, // Ensure we have the full ID
				createdAt: model.updatedAt.toISOString(), // Convert Date to string
				config: model.config as Record<string, any> | undefined, // Type assertion for config
				'model-index': (model as any)['model-index'] as ExtendedModelEntry['model-index'],
				spaces: (model as any).spaces as ExtendedModelEntry['spaces'],
			};

			return formatModelDetails(modelWithExtras);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to get model details: ${error.message}`);
			}
			throw error;
		}
	}
}

// Formatting Function
function formatModelDetails(model: ExtendedModelEntry & { id: string }): string {
	const r: string[] = [];
	const [author, name] = model.name.includes('/') ? model.name.split('/') : ['', model.name];

	r.push(`# ${model.name}`);
	r.push('');

	// Overview section
	r.push('## Overview');
	if (author || model.author) r.push(`- **Author:** ${author || model.author}`);
	if (model.pipeline_tag) r.push(`- **Task:** ${model.pipeline_tag}`);
	if (model.library_name) r.push(`- **Library:** ${model.library_name}`);

	const stats = [];
	if (model.downloadsAllTime) stats.push(`**Downloads:** ${formatNumber(model.downloadsAllTime)}`);
	if (model.likes) stats.push(`**Likes:** ${model.likes}`);
	if (stats.length > 0) {
		r.push(`- ${stats.join(' | ')}`);
	}

	if (model.createdAt) r.push(`- **Created:** ${formatDate(model.createdAt)}`);
	if (model.updatedAt) r.push(`- **Updated:** ${formatDate(model.updatedAt.toISOString())}`);

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

	// Model Card Metadata
	if (model.cardData) {
		const metadata = [];

		if (model.cardData.language) {
			const languages = Array.isArray(model.cardData.language)
				? model.cardData.language.join(', ')
				: model.cardData.language;
			metadata.push(`- **Language:** ${languages}`);
		}

		if (model.cardData.license) {
			metadata.push(`- **License:** ${model.cardData.license}`);
		}

		if (model.cardData.datasets) {
			const datasets = Array.isArray(model.cardData.datasets)
				? model.cardData.datasets.join(', ')
				: model.cardData.datasets;
			metadata.push(`- **Datasets:** ${datasets}`);
		}

		if (model.cardData.finetuned_from) {
			metadata.push(`- **Fine-tuned from:** ${model.cardData.finetuned_from}`);
		}

		if (metadata.length > 0) {
			r.push('## Metadata');
			r.push(...metadata);
			r.push('');
		}
	}

	// Benchmark results
	if (model['model-index'] && model['model-index'].length > 0) {
		r.push('## Benchmarks');

		for (const benchmark of model['model-index']) {
			if (benchmark.results && benchmark.results.length > 0) {
				for (const result of benchmark.results) {
					const taskName = result.task?.name || result.task?.type || 'Unknown task';
					const datasetName = result.dataset?.name || 'Unknown dataset';

					r.push(`- **${taskName} on ${datasetName}:**`);

					if (result.metrics && result.metrics.length > 0) {
						for (const metric of result.metrics) {
							const metricName = metric.name || metric.type || 'Score';
							r.push(`  - ${metricName}: ${metric.value}`);
						}
					}
				}
			}
		}
		r.push('');
	}

	// Related Spaces
	if (model.spaces && model.spaces.length > 0) {
		r.push('## Demo Spaces');
		for (const space of model.spaces.slice(0, 5)) {
			const title = space.title || space.name;
			r.push(`- [${title}](https://huggingface.co/spaces/${space.id})`);
		}

		if (model.spaces.length > 5) {
			r.push(`- *... and ${model.spaces.length - 5} more spaces*`);
		}
		r.push('');
	}

	r.push(`**Link:** [https://hf.co/${model.name}](https://hf.co/${model.name})`);

	return r.join('\n');
}
