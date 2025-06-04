import { z } from 'zod';
import { listModels, type ModelEntry } from '@huggingface/hub';
import type { PipelineType } from '@huggingface/hub';
import { formatDate, formatNumber } from './utilities.js';

export const TAGS_TO_RETURN = 20;
// Model Search Tool Configuration
export const MODEL_SEARCH_TOOL_CONFIG = {
	name: 'model_search',
	description:
		'Find Machine Learning models hosted on Hugging Face. Use a general query, or specify author, task or library. Returns detailed info about matching models including downloads, likes, tags, and direct links.',
	schema: z.object({
		query: z.string().optional().describe('Search term for finding models by name or description'),
		author: z
			.string()
			.optional()
			.describe("Organization or user who created the model (e.g., 'google', 'meta-llama', 'microsoft')"),
		task: z
			.string()
			.optional()
			.describe("Model task type (e.g., 'text-generation', 'image-classification', 'translation')"),
		library: z.string().optional().describe("Framework the model uses (e.g., 'transformers', 'diffusers', 'timm')"),
		limit: z.number().min(1).max(100).optional().default(20).describe('Maximum number of results to return (1-100)'),
	}),
	annotations: {
		title: 'Model Search',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;
//huggingface.co/api/models?search=llama&expand=transformersInfo
// Define search parameter types
export type ModelSearchParams = z.infer<typeof MODEL_SEARCH_TOOL_CONFIG.schema>;

// Extended ModelEntry interface to include more fields we want
interface ExtendedModelEntry extends ModelEntry {
	author?: string;
	library_name?: string;
	tags?: string[];
	createdAt?: string;
	downloadsAllTime?: number;
	pipeline_tag?: string;
}

/**
 * Service for searching Hugging Face Models using the official huggingface.js library
 */
export class ModelSearchTool {
	private readonly hubUrl?: string;
	private readonly accessToken?: string;

	/**
	 * @param hfToken Optional Hugging Face token for API access
	 * @param hubUrl Optional custom hub URL
	 */
	constructor(hfToken?: string, hubUrl?: string) {
		this.accessToken = hfToken;
		this.hubUrl = hubUrl;
	}

	/**
	 * Search for models with detailed parameters
	 */
	async searchWithParams(params: Partial<ModelSearchParams>): Promise<string> {
		try {
			// Convert our params to the format expected by the hub library
			const searchParams: {
				query?: string;
				owner?: string;
				task?: PipelineType;
				tags?: string[];
			} = {};

			// Handle query parameter
			if (params.query) {
				searchParams.query = params.query;
			}

			if (params.author) {
				searchParams.owner = params.author;
			}

			if (params.task) {
				searchParams.task = params.task as PipelineType;
			}

			// Add library as a tag filter if specified
			if (params.library) {
				searchParams.tags = [params.library];
			}

			const models: ExtendedModelEntry[] = [];

			// Collect results from the async generator
			for await (const model of listModels({
				search: searchParams,
				additionalFields: ['author', 'library_name', 'tags', 'downloadsAllTime'],
				limit: params.limit,
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
				...(this.hubUrl && { hubUrl: this.hubUrl }),
			})) {
				models.push({
					...model,
					pipeline_tag: model.task,
					createdAt: model.updatedAt.toISOString(),
				} as ExtendedModelEntry);
			}

			if (models.length === 0) {
				return `No models found for the given criteria.`;
			}

			return formatSearchResults(models, params);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to search for models: ${error.message}`);
			}
			throw error;
		}
	}
}

// Formatting Function
function formatSearchResults(models: ExtendedModelEntry[], params: Partial<ModelSearchParams>): string {
	const r: string[] = [];

	// Build search description
	const searchTerms = [];
	if (params.query) searchTerms.push(`query "${params.query}"`);
	if (params.author) searchTerms.push(`author "${params.author}"`);
	if (params.task) searchTerms.push(`task "${params.task}"`);
	if (params.library) searchTerms.push(`library "${params.library}"`);

	const searchDesc = searchTerms.length > 0 ? ` matching ${searchTerms.join(', ')}` : '';

	const resultText =
		models.length === params.limit
			? `Showing first ${models.length.toString()} models${searchDesc}:`
			: `Found ${models.length.toString()} models${searchDesc}:`;
	r.push(resultText);
	r.push('');

	for (const model of models) {
		r.push(`## ${model.name}`);
		r.push('');

		// Basic info line
		const info = [];
		if (model.pipeline_tag) info.push(`**Task:** ${model.pipeline_tag}`);
		if (model.library_name) info.push(`**Library:** ${model.library_name}`);
		if (model.downloads) info.push(`**Downloads:** ${formatNumber(model.downloads)}`);
		if (model.likes) info.push(`**Likes:** ${model.likes.toString()}`);

		if (info.length > 0) {
			r.push(info.join(' | '));
			r.push('');
		}

		// Tags
		if (model.tags && model.tags.length > 0) {
			r.push(`**Tags:** ${model.tags.slice(0, TAGS_TO_RETURN).join(', ')}`);
			if (model.tags.length > TAGS_TO_RETURN) {
				r.push(`*and ${(model.tags.length - TAGS_TO_RETURN).toString()} more...*`);
			}
			r.push('');
		}

		// Status indicators
		const status = [];
		if (model.gated) status.push('🔒 Gated');
		if (model.private) status.push('🔐 Private');
		if (status.length > 0) {
			r.push(status.join(' | '));
			r.push('');
		}

		// Dates
		if (model.createdAt) {
			r.push(`**Created:** ${formatDate(model.createdAt)}`);
		}
		if (model.updatedAt.toISOString() !== model.createdAt) {
			r.push(`**Updated:** ${formatDate(model.updatedAt)}`);
		}

		r.push(`**Link:** [https://hf.co/${model.name}](https://hf.co/${model.name})`);
		r.push('');
		r.push('---');
		r.push('');
	}

	return r.join('\n');
}
