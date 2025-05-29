import { z } from 'zod';
import { modelInfo } from '@huggingface/hub';
import { formatDate, formatNumber } from './model-utils.js';

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

// Clean interface design with explicit data availability

// Required core information that should always be available
interface ModelBasicInfo {
	id: string; // Model ID
	name: string; // Model name
	downloads: number;
	likes: number;
	private: boolean;
	gated: false | 'auto' | 'manual';
	updatedAt: Date;
}

// Optional but reliable information with simple types
interface ModelExtendedInfo {
	author?: string;
	library_name?: string;
	pipeline_tag?: string; // Task type
	downloadsAllTime?: number;
	tags?: string[];
}

// Technical details that need validation
interface ModelTechnicalDetails {
	modelType?: string; // From config.model_type if exists
	vocabSize?: number; // From config.vocab_size if exists
	parameters?: number; // From safetensors.total if exists
	modelClass?: string; // From transformersInfo.auto_model if exists
}

// Metadata from cardData with careful extraction
interface ModelMetadata {
	language?: string | string[];
	license?: string | string[];
	datasets?: string | string[];
	fineTunedFrom?: string;
}

// Complete model information structure
interface ModelInformation extends ModelBasicInfo {
	extended?: ModelExtendedInfo;
	technical?: ModelTechnicalDetails;
	metadata?: ModelMetadata;
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
			const additionalFields = [
				'author',
				'downloadsAllTime',
				'library_name',
				'tags',
				'config',
				'transformersInfo',
				'safetensors',
				'cardData',
				'spaces',
			] as const;

			const modelData = await modelInfo<(typeof additionalFields)[number]>({
				name: modelId,
				additionalFields: Array.from(additionalFields),
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
				...(this.hubUrl && { hubUrl: this.hubUrl }),
			});

			// Build the structured model information
			const modelDetails: ModelInformation = {
				// Basic info (required fields)
				id: modelId,
				name: modelData.name,
				downloads: modelData.downloads,
				likes: modelData.likes,
				private: modelData.private,
				gated: modelData.gated,
				updatedAt: modelData.updatedAt,

				// Extended info (optional but reliable fields)
				extended: {
					author: modelData.author,
					library_name: modelData.library_name,
					pipeline_tag: modelData.task,
					downloadsAllTime: modelData.downloadsAllTime,
					tags: modelData.tags,
				},
			};

			// Technical details (requires validation)
			const technical: ModelTechnicalDetails = {};

			// Extract config details safely if they exist
			if (modelData.config && typeof modelData.config === 'object') {
				const config = modelData.config as Record<string, unknown>;
				if ('model_type' in config && typeof config.model_type === 'string') {
					technical.modelType = config.model_type;
				}
				if ('vocab_size' in config && typeof config.vocab_size === 'number') {
					technical.vocabSize = config.vocab_size;
				}
			}

			// Extract safe tensors info
			if (modelData.safetensors && typeof modelData.safetensors.total === 'number') {
				technical.parameters = modelData.safetensors.total;
			}

			// Extract transformers info
			if (modelData.transformersInfo && modelData.transformersInfo.auto_model) {
				technical.modelClass = modelData.transformersInfo.auto_model;
			}

			// Only add technical section if we have data
			if (Object.keys(technical).length > 0) {
				modelDetails.technical = technical;
			}

			// Metadata from card data
			if (modelData.cardData) {
				const metadata: ModelMetadata = {};
				const cardData = modelData.cardData as Record<string, unknown>;

				if ('language' in cardData) {
					metadata.language = cardData.language as string | string[];
				}

				if ('license' in cardData) {
					metadata.license = cardData.license as string | string[];
				}

				if ('datasets' in cardData) {
					metadata.datasets = cardData.datasets as string | string[];
				}

				if ('finetuned_from' in cardData) {
					metadata.fineTunedFrom = cardData.finetuned_from as string;
				}

				// Only add metadata section if we have data
				if (Object.keys(metadata).length > 0) {
					modelDetails.metadata = metadata;
				}
			}

			// Extract spaces information if available
			const spaces = modelData.spaces;
			if (Array.isArray(spaces) && spaces.length > 0) {
				try {
					modelDetails.spaces = spaces.map((spaceId) => {
						// Format is typically username/spacename
						const parts = spaceId.split('/');
						const name = parts.length > 1 ? parts[1] : spaceId;
						return {
							id: spaceId,
							name: name || spaceId, // Ensure name is always a string
							title: name, // Default to name if title not available
						};
					});
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				} catch (ignoreUnformattedSpaces) {
					console.error(`Error  processing spaces for model ${modelId}:`);
				}
			}

			return formatModelDetails(modelDetails);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to get model details: ${error.message}`);
			}
			throw error;
		}
	}
}

// Formatting Function
function formatModelDetails(model: ModelInformation): string {
	const r: string[] = [];
	const [authorFromName] = model.name.includes('/') ? model.name.split('/') : ['', model.name];

	r.push(`# ${model.name}`);
	r.push('');

	// Overview section - using only reliable fields
	r.push('## Overview');

	// Author - from extended info or parsed from name
	if (model.extended?.author || authorFromName) {
		r.push(`- **Author:** ${model.extended?.author || authorFromName || ''}`);
	}

	// Task type
	if (model.extended?.pipeline_tag) {
		r.push(`- **Task:** ${model.extended.pipeline_tag}`);
	}

	// Library
	if (model.extended?.library_name) {
		r.push(`- **Library:** ${model.extended.library_name}`);
	}

	// Statistics
	const stats = [];
	if (model.extended?.downloadsAllTime) {
		stats.push(`**Downloads:** ${formatNumber(model.extended.downloadsAllTime)}`);
	}
	if (model.likes) {
		stats.push(`**Likes:** ${model.likes.toString()}`);
	}
	if (stats.length > 0) {
		r.push(`- ${stats.join(' | ')}`);
	}

	// Dates
	r.push(`- **Updated:** ${formatDate(model.updatedAt.toISOString())}`);

	// Status indicators
	const status = [];
	if (model.gated) status.push('🔒 Gated');
	if (model.private) status.push('🔐 Private');
	if (status.length > 0) {
		r.push(`- **Status:** ${status.join(' | ')}`);
	}
	r.push('');

	// Technical Details - only if we have validated information
	if (model.technical && Object.keys(model.technical).length > 0) {
		r.push('## Technical Details');

		if (model.technical.modelClass) {
			r.push(`- **Model Class:** ${model.technical.modelClass}`);
		}

		if (model.technical.parameters) {
			r.push(`- **Parameters:** ${formatNumber(model.technical.parameters)}`);
		}

		if (model.technical.modelType) {
			r.push(`- **Architecture:** ${model.technical.modelType}`);
		}

		if (model.technical.vocabSize) {
			r.push(`- **Vocab Size:** ${formatNumber(model.technical.vocabSize)}`);
		}

		r.push('');
	}

	// Tags - reliable field from extended info
	if (model.extended?.tags && model.extended.tags.length > 0) {
		r.push('## Tags');
		r.push(model.extended.tags.map((tag) => `\`${tag}\``).join(' '));
		r.push('');
	}

	// Metadata - carefully extracted and validated
	if (model.metadata) {
		const metadata = [];

		if (model.metadata.language) {
			const languages = Array.isArray(model.metadata.language)
				? model.metadata.language.join(', ')
				: model.metadata.language;
			metadata.push(`- **Language:** ${languages}`);
		}

		if (model.metadata.license) {
			const license = Array.isArray(model.metadata.license)
				? model.metadata.license.join(', ')
				: model.metadata.license;
			metadata.push(`- **License:** ${license}`);
		}

		if (model.metadata.datasets) {
			const datasets = Array.isArray(model.metadata.datasets)
				? model.metadata.datasets.join(', ')
				: model.metadata.datasets;
			metadata.push(`- **Datasets:** ${datasets}`);
		}

		if (model.metadata.fineTunedFrom) {
			metadata.push(`- **Fine-tuned from:** ${model.metadata.fineTunedFrom}`);
		}

		if (metadata.length > 0) {
			r.push('## Metadata');
			r.push(...metadata);
			r.push('');
		}
	}

	// Spaces - processed with validation
	if (model.spaces && model.spaces.length > 0) {
		r.push('## Demo Spaces');
		for (const space of model.spaces.slice(0, 5)) {
			const title = space.title || space.name;
			r.push(`- [${title}](https://hf.co/spaces/${space.id})`);
		}

		if (model.spaces.length > 5) {
			r.push(`- *... and ${(model.spaces.length - 5).toString()} more spaces*`);
		}
		r.push('');
	}

	// Link is reliable - based on model name which is required
	r.push(`**Link:** [https://hf.co/${model.name}](https://hf.co/${model.name})`);

	return r.join('\n');
}
