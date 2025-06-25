import { z } from 'zod';
import { HfApiCall } from '../hf-api-call.js';


export const DOCS_SEMANTIC_SEARCH_CONFIG = {
	name: 'search_hf_docs',
	description:
		'Search the Hugging Face product documentation.  ', // TODO -- test description
	schema: z.object({
		query: z
			.string()
			.min(3, 'Supply at least one search term')
			.max(200, 'Query too long')
			.describe('Semantic Search query'),
	}),
	annotations: {
		title: 'Hugging Face Documentation Search',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;


export type DocSearchParams = z.infer<typeof DOCS_SEMANTIC_SEARCH_CONFIG.schema>;

interface DocSearchResult{
	result: string;
}
/**
 * Use the Hugging Face Semantic Document Search API
 * 
 * 
 * 
 * 
 */
export class DocSearchTool extends HfApiCall<DocSearchParams, DocSearchResult[]> {
	/**
	 *
	 * @param apiUrl The URL of the Hugging Face document search API
	 * @param hfToken Optional Hugging Face token for API access
	 */
	constructor(hfToken?: string, apiUrl = 'https://huggingface.co/api/docs/search') {
		super(apiUrl, hfToken);
	}

	/**
	 * @param query Search query string (e.g. "llama", "attention")
	 */
	async search(query: string,): Promise<string> {
		try {
			if (!query) return 'No query';

			const papers = await this.callApi<DocSearchResult[]>({ query: query });

			if (papers.length === 0) return `No papers found for query '${query}'`;
			return formatSearchResults(query, papers.slice(0), papers.length);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to search for papers: ${error.message}`);
			}
			throw error;
		}
	}
}


function formatSearchResults(
	query: string,
	papers: DocSearchResult[],
	totalCount: number,
): string {
	const r: string[] = [];
	const showingText =
		papers.length < totalCount
			? `${totalCount} papers matched the query '${query}'. Here are the first ${papers.length} results.`
			: `All ${papers.length} papers that matched the query '${query}'`;
	r.push(showingText);

	r.push('');
	r.push('---');
	return r.join('\n');
}

