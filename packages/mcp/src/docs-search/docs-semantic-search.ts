import { z } from 'zod';
import { HfApiCall } from '../hf-api-call.js';
import { escapeMarkdown } from '../utilities.js';
import { DOC_FETCH_CONFIG } from './doc-fetch.js';

export const DOCS_SEMANTIC_SEARCH_CONFIG = {
	name: 'docs_search',
	description:
		'Search the Hugging Face documentation library with semantic search. Returns documentation excerpts ' +
		'grouped by Product and document page.',
	schema: z.object({
		query: z
			.string()
			.min(3, 'Supply at least one search term')
			.max(200, 'Query too long')
			.describe('Semantic search query'),
		product: z
			.string()
			.optional()
			.describe('Filter by specific product (e.g., "hub", "dataset-viewer", "transformers")'),
	}),
	annotations: {
		title: 'Hugging Face Documentation Search',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

export type DocSearchParams = z.infer<typeof DOCS_SEMANTIC_SEARCH_CONFIG.schema>;

interface DocSearchResult {
	text: string;
	product: string;
	heading1: string;
	source_page_url: string;
	source_page_title: string;
	heading2?: string;
}

interface DocSearchApiParams {
	q: string;
	product?: string;
}

/**
 * Use the Hugging Face Semantic Document Search API
 */
export class DocSearchTool extends HfApiCall<DocSearchApiParams, DocSearchResult[]> {
	/**
	 * @param apiUrl The URL of the Hugging Face document search API
	 * @param hfToken Optional Hugging Face token for API access
	 */
	constructor(hfToken?: string, apiUrl = 'https://hf.co/api/docs/search') {
		super(apiUrl, hfToken);
	}

	/**
	 * @param query Search query string (e.g. "rate limits", "analytics")
	 * @param product Optional product filter
	 */
	async search(query: string, product?: string): Promise<string> {
		try {
			if (!query) return 'No query provided';

			const params: DocSearchApiParams = { q: query.toLowerCase() };
			if (product) {
				params.product = product;
			}

			const results = await this.callApi<DocSearchResult[]>(params);

			if (results.length === 0) {
				return product
					? `No documentation found for query '${query}' in product '${product}'`
					: `No documentation found for query '${query}'`;
			}

			return formatSearchResults(query, results, product);
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to search documentation: ${error.message}`);
			}
			throw error;
		}
	}
}

/**
 * Group results by product and source page URL
 */
function groupResults(results: DocSearchResult[]): Map<string, Map<string, DocSearchResult[]>> {
	const grouped = new Map<string, Map<string, DocSearchResult[]>>();

	for (const result of results) {
		if (!grouped.has(result.product)) {
			grouped.set(result.product, new Map());
		}

		const productGroup = grouped.get(result.product);
		if (!productGroup) continue;

		if (!productGroup.has(result.source_page_url)) {
			productGroup.set(result.source_page_url, []);
		}

		const pageResults = productGroup.get(result.source_page_url);
		if (pageResults) {
			pageResults.push(result);
		}
	}

	return grouped;
}

/**
 * Format a single result excerpt
 */
function formatExcerpt(result: DocSearchResult): string {
	const lines: string[] = [];

	if (result.heading2) {
		lines.push(`**Excerpt from "${escapeMarkdown(result.heading2)}":**`);
	}

	// Clean up the text - remove HTML tags if any
	const cleanText = result.text
		.replace(/<[^>]*>/g, '')
		.replace(/\n\s*\n/g, '\n')
		.trim();

	lines.push(cleanText);
	lines.push('');

	return lines.join('\n');
}

/**
 * Format search results grouped by product and page
 */
function formatSearchResults(query: string, results: DocSearchResult[], productFilter?: string): string {
	const lines: string[] = [];

	// Header
	const filterText = productFilter ? ` (filtered by product: ${productFilter})` : '';
	lines.push(`# Documentation Search Results for "${escapeMarkdown(query)}"${filterText}`);
	lines.push('');
	lines.push(`Found ${results.length} results`);
	lines.push('');

	// Group results
	const grouped = groupResults(results);

	// Sort products by count (most hits first)
	const sortedProducts = Array.from(grouped.keys()).sort((a, b) => {
		const productGroupA = grouped.get(a);
		const productGroupB = grouped.get(b);
		if (!productGroupA || !productGroupB) return 0;

		const countA = Array.from(productGroupA.values()).reduce((sum, arr) => sum + arr.length, 0);
		const countB = Array.from(productGroupB.values()).reduce((sum, arr) => sum + arr.length, 0);
		return countB - countA; // Descending order
	});

	for (const product of sortedProducts) {
		const productGroup = grouped.get(product);
		if (!productGroup) continue;

		const totalProductHits = Array.from(productGroup.values()).reduce((sum, arr) => sum + arr.length, 0);
		lines.push(`## Results for Product: ${escapeMarkdown(product)} (${totalProductHits} results)`);
		lines.push('');

		// Sort URLs within each product by count (most hits first)
		const sortedUrls = Array.from(productGroup.keys()).sort((a, b) => {
			const pageResultsA = productGroup.get(a);
			const pageResultsB = productGroup.get(b);
			if (!pageResultsA || !pageResultsB) return 0;
			return pageResultsB.length - pageResultsA.length;
		});

		for (const url of sortedUrls) {
			const pageResults = productGroup.get(url);
			if (!pageResults || pageResults.length === 0) continue;
			const firstResult = pageResults[0];

			// Skip if no results (shouldn't happen but TypeScript safety)
			if (!firstResult) continue;

			// Page header with link and hit count
			const pageTitle = firstResult.heading1 || firstResult.source_page_title;
			const hitCount = pageResults.length > 1 ? ` (${pageResults.length} results)` : '';
			lines.push(`### Results from [${escapeMarkdown(pageTitle)}](${url})${hitCount}`);
			lines.push('');

			// Add each excerpt from this page
			for (const result of pageResults) {
				lines.push(formatExcerpt(result));
			}
		}
	}

	// Add suggestion to use doc fetch tool
	lines.push('---');
	lines.push(`Use the "${DOC_FETCH_CONFIG.name}" tool to download a specific document.`);

	return lines.join('\n');
}
