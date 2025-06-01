import { z } from 'zod';
import { listDatasets, type DatasetEntry } from '@huggingface/hub';
import { formatDate, formatNumber } from './model-utils.js';

export const DatasetSearchDescription = 'Search Hugging Face Datasets for machine learning.';

const TAGS_TO_RETURN = 20;
// Dataset Search Tool Configuration
export const DATASET_SEARCH_TOOL_CONFIG = {
	name: 'dataset_search',
	description:
		'Find datasets on Hugging Face by name, author, task type, or tags. Returns detailed info about matching datasets including downloads, likes, tags, and direct links.',
	schema: z.object({
		query: z.string().optional().describe('Search term for finding datasets by name or description'),
		author: z
			.string()
			.optional()
			.describe("Organization or user who created the dataset (e.g., 'google', 'facebook', 'allenai')"),
		tags: z
			.array(z.string())
			.optional()
			.describe(
				"Tags to filter datasets (e.g., ['language:en', 'size_categories:1M<n<10M', 'task_categories:text-classification'])"
			),
		limit: z.number().min(1).max(100).optional().default(20).describe('Maximum number of results to return (1-100)'),
		sort: z
			.enum(['downloads', 'likes', 'lastModified'])
			.optional()
			.default('downloads')
			.describe('How to order results (download count, likes, or last modified date)'),
	}),
	annotations: {
		title: 'Dataset Search',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

// Define search parameter types
export type DatasetSearchParams = z.infer<typeof DATASET_SEARCH_TOOL_CONFIG.schema>;

// Extended DatasetEntry interface to include more fields we want
interface ExtendedDatasetEntry extends DatasetEntry {
	author?: string;
	tags?: string[];
	createdAt?: string;
	downloadsAllTime?: number;
	description?: string;
}

/**
 * Service for searching Hugging Face Datasets using the official huggingface.js library
 */
export class DatasetSearchTool {
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
	 * Search for datasets with detailed parameters
	 */
	async searchWithParams(params: Partial<DatasetSearchParams>): Promise<string> {
		try {
			// Convert our params to the format expected by the hub library
			const searchParams: {
				query?: string;
				owner?: string;
				tags?: string[];
				sort?: string;
			} = {};

			// Handle query parameter
			if (params.query) {
				searchParams.query = params.query;
			}

			if (params.author) {
				searchParams.owner = params.author;
			}

			if (params.tags && params.tags.length > 0) {
				searchParams.tags = params.tags;
			}

			// Pass the sort parameter directly to the API
			if (params.sort) {
				searchParams.sort = params.sort;
			}

			const datasets: ExtendedDatasetEntry[] = [];

			// Collect results from the async generator
			for await (const dataset of listDatasets({
				search: searchParams,
				additionalFields: ['author', 'tags', 'downloadsAllTime', 'description'],
				limit: params.limit,
				...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
				...(this.hubUrl && { hubUrl: this.hubUrl }),
			})) {
				datasets.push({
					...dataset,
					createdAt: dataset.updatedAt.toISOString(),
				} as ExtendedDatasetEntry);
			}

			if (datasets.length === 0) {
				return `No datasets found for the given criteria.`;
			}

			return formatSearchResults(datasets, params);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to search for datasets: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Simple search by text query (convenience method)
	 */
	async searchByQuery(query: string, limit: number = 20): Promise<string> {
		return this.searchWithParams({ query, limit, sort: 'downloads' });
	}

	/**
	 * Search by author/organization
	 */
	async searchByAuthor(author: string, limit: number = 20): Promise<string> {
		return this.searchWithParams({ author, limit, sort: 'downloads' });
	}

	/**
	 * Search by tags
	 */
	async searchByTags(tags: string[], limit: number = 20): Promise<string> {
		return this.searchWithParams({ tags, limit, sort: 'downloads' });
	}
}

// Formatting Function
function formatSearchResults(datasets: ExtendedDatasetEntry[], params: Partial<DatasetSearchParams>): string {
	const r: string[] = [];

	// Build search description
	const searchTerms = [];
	if (params.query) searchTerms.push(`query "${params.query}"`);
	if (params.author) searchTerms.push(`author "${params.author}"`);
	if (params.tags && params.tags.length > 0) searchTerms.push(`tags [${params.tags.join(', ')}]`);

	const searchDesc = searchTerms.length > 0 ? ` matching ${searchTerms.join(', ')}` : '';

	const resultText = datasets.length === params.limit 
		? `Showing first ${datasets.length.toString()} datasets${searchDesc}:`
		: `Found ${datasets.length.toString()} datasets${searchDesc}:`;
	r.push(resultText);
	r.push('');

	for (const dataset of datasets) {
		r.push(`## ${dataset.name}`);
		r.push('');

		// Description if available
		if (dataset.description) {
			r.push(`${dataset.description.substring(0, 200)}${dataset.description.length > 200 ? '...' : ''}`);
			r.push('');
		}

		// Basic info line
		const info = [];
		if (dataset.downloads) info.push(`**Downloads:** ${formatNumber(dataset.downloads)}`);
		if (dataset.likes) info.push(`**Likes:** ${dataset.likes.toString()}`);

		if (info.length > 0) {
			r.push(info.join(' | '));
			r.push('');
		}

		// Tags
		if (dataset.tags && dataset.tags.length > 0) {
			r.push(`**Tags:** ${dataset.tags.slice(0, TAGS_TO_RETURN).join(', ')}`);
			if (dataset.tags.length > TAGS_TO_RETURN) {
				r.push(`*and ${(dataset.tags.length - TAGS_TO_RETURN).toString()} more...*`);
			}
			r.push('');
		}

		// Status indicators
		const status = [];
		if (dataset.gated) status.push('🔒 Gated');
		if (dataset.private) status.push('🔐 Private');
		if (status.length > 0) {
			r.push(status.join(' | '));
			r.push('');
		}

		// Dates
		if (dataset.createdAt) {
			r.push(`**Created:** ${formatDate(dataset.createdAt)}`);
		}

		if (dataset.updatedAt.toISOString() !== dataset.createdAt) {
			r.push(`**Updated:** ${formatDate(dataset.updatedAt.toISOString())}`);
		}

		r.push(`**Link:** [https://hf.co/datasets/${dataset.name}](https://hf.co/datasets/${dataset.name})`);
		r.push('');
		r.push('---');
		r.push('');
	}

	return r.join('\n');
}
