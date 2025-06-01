import { z } from 'zod';
import { HfApiCall } from './hf-api-call.js';

// Define the SearchResult interface
export interface SpaceSearchResult {
	id: string;
	emoji?: string; // Emoji for the space
	likes?: number;
	title?: string;
	author: string;
	runtime: {
		stage?: string; // always seems to be "RUNNING"
	};
	ai_category?: string;
	ai_short_description?: string;
	shortDescription?: string;
	semanticRelevancyScore?: number; // Score from semantic search API
	trendingScore?: number;
	lastModified?: Date;
}

// Define input types for space search
interface SpaceSearchParams {
	q: string;
	sdk: string;
	filter?: string;
}

// Default number of results to return
const RESULTS_TO_RETURN = 10;

export const SemanticSearchDescription = 'Search Hugging Face Spaces with semantic search.';

export const SEMANTIC_SEARCH_TOOL_CONFIG = {
	name: 'space_search',
	description: 'Search for Hugging Face Spaces. ' + 'Include links to the Space when presenting the results.',
	schema: z.object({
		query: z.string().min(1, 'Search query is required').max(50, 'Query too long').describe('Semantic Search Query'),
		limit: z.number().optional().default(RESULTS_TO_RETURN).describe('Number of results to return'),
		mcp: z.boolean().optional().default(false).describe('Only include MCP Server enabled Spaces'),
	}),
	annotations: {
		title: 'Hugging Face Space Search',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

/**
 * Service for searching Hugging Face Spaces semantically
 */
export class SpaceSearchTool extends HfApiCall<SpaceSearchParams, SpaceSearchResult[]> {
	/**
	 * Creates a new semantic search service
	 * @param apiUrl The URL of the Hugging Face semantic search API
	 * @param hfToken Optional Hugging Face token for API access
	 */
	constructor(hfToken?: string, apiUrl = 'https://huggingface.co/api/spaces/semantic-search') {
		super(apiUrl, hfToken);
	}

	/**
	 * Performs a semantic search on Hugging Face Spaces
	 * @param query The search query
	 * @param limit Maximum number of results to return
	 * @returns An array of search results
	 */
	async search(query: string, limit: number = RESULTS_TO_RETURN, mcp: boolean = false): Promise<{ results: SpaceSearchResult[], totalCount: number }> {
		try {
			// Validate input before making API call
			if (!query) {
				return { results: [], totalCount: 0 };
			}

			// Prepare API parameters, adding the filter if mcp is true
			const params: SpaceSearchParams = { q: query, sdk: 'gradio' };

			if (mcp) {
				params.filter = 'mcp-server';
			}

			const results = await this.callApi<SpaceSearchResult[]>(params);

			return { results: results.slice(0, limit), totalCount: results.length };
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to search for spaces: ${error.message}`);
			}
			throw error;
		}
	}
}

// Create a schema validator for search parameters
export const SearchParamsSchema = SEMANTIC_SEARCH_TOOL_CONFIG.schema;

export type SearchParams = z.infer<typeof SEMANTIC_SEARCH_TOOL_CONFIG.schema>;

/**
 * Formats search results as a markdown table for MCP friendly output
 * @param results The search results to format
 * @returns A markdown formatted string with the search results
 */
export const formatSearchResults = (query: string, results: SpaceSearchResult[], totalCount: number): string => {
	if (results.length === 0) {
		return `No matching Hugging Face Spaces found for the query '${query}'. Try a different query.`;
	}

	const showingText = results.length < totalCount 
		? `Showing ${results.length} of ${totalCount} results`
		: `All ${results.length} results`;
	let markdown = `# Space Search Results for the query '${query}' (${showingText})\n\n`;
	markdown += '| Space | Description | Author | ID | Category |  Likes | Trending Score | Relevance |\n';
	markdown += '|-------|-------------|--------|----|----------|--------|----------------|-----------|\n';

	for (const result of results) {
		const title = result.title || 'Untitled';
		const description = result.shortDescription || result.ai_short_description || 'No description';
		const author = result.author || 'Unknown';
		const id = result.id || '';
		const emoji = result.emoji ? escapeMarkdown(result.emoji) + ' ' : '';
		const relevance = result.semanticRelevancyScore ? (result.semanticRelevancyScore * 100).toFixed(1) + '%' : 'N/A';

		markdown +=
			`| ${emoji}[${escapeMarkdown(title)}](https://hf.co/spaces/${id}) ` +
			`| ${escapeMarkdown(description)} ` +
			`| ${escapeMarkdown(author)} ` +
			`| \`${escapeMarkdown(id)}\` ` +
			`| \`${escapeMarkdown(result.ai_category ?? '-')}\` ` +
			`| ${escapeMarkdown(result.likes?.toString() ?? '-')} ` +
			`| ${escapeMarkdown(result.trendingScore?.toString() ?? '-')} ` +
			`| ${relevance} |\n`;
	}

	return markdown;
};

/**
 * Escapes special markdown characters in a string
 * @param text The text to escape
 * @returns The escaped text
 */
function escapeMarkdown(text: string): string {
	if (!text) return '';
	// Replace pipe characters and newlines for table compatibility
	// Plus additional markdown formatting characters for better safety
	return text
		.replace(/\|/g, '\\|')
		.replace(/\n/g, ' ')
		.replace(/\*/g, '\\*')
		.replace(/_/g, '\\_')
		.replace(/~/g, '\\~')
		.replace(/`/g, '\\`')
		.replace(/>/g, '\\>')
		.replace(/#/g, '\\#');
}
