import { z } from 'zod';
import { HfApiCall } from '../hf-api-call.js';
import { escapeMarkdown } from '../utilities.js';
import { DOC_FETCH_CONFIG } from './doc-fetch.js';

export const DOCS_SEMANTIC_SEARCH_CONFIG = {
	name: 'hf_doc_search',
	description: 'Search the Hugging Face documentation library. Returns excerpts grouped by Product and Document.',
	schema: z.object({
		query: z
			.string()
			.min(3, 'Supply at least one search term')
			.max(200, 'Query too long')
			.describe('Semantic search query'),
		product: z
			.string()
			.optional()
			.describe(
				'Filter by Product (e.g., "hub", "dataset-viewer", "transformers"). Supply when known for focused results'
			),
	}),
	annotations: {
		title: 'Hugging Face Documentation Library Search',
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
	async search(params: DocSearchParams): Promise<string> {
		try {
			if (!params.query) return 'No query provided';

			const apiParams: DocSearchApiParams = { q: params.query.toLowerCase() };
			if (params.product) {
				apiParams.product = params.product;
			}

			const results = await this.callApi<DocSearchResult[]>(apiParams);

			if (results.length === 0) {
				return params.product
					? `No documentation found for query '${params.query}' in product '${params.product}'`
					: `No documentation found for query '${params.query}'`;
			}

			return formatSearchResults(params.query, results, params.product);
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

		// Strip the anchor (#section) from the URL for grouping purposes
		const baseUrl = result.source_page_url.split('#')[0] || result.source_page_url;

		if (!productGroup.has(baseUrl)) {
			productGroup.set(baseUrl, []);
		}

		const pageResults = productGroup.get(baseUrl);
		if (pageResults) {
			pageResults.push(result);
		}
	}

	return grouped;
}

/**
 * Group page results by section (heading2)
 */
function groupBySection(pageResults: DocSearchResult[]): Map<string | undefined, DocSearchResult[]> {
	const sectionGroups = new Map<string | undefined, DocSearchResult[]>();

	for (const result of pageResults) {
		const section = result.heading2;
		if (!sectionGroups.has(section)) {
			sectionGroups.set(section, []);
		}
		const sectionResults = sectionGroups.get(section);
		if (sectionResults) {
			sectionResults.push(result);
		}
	}

	return sectionGroups;
}

/**
 * Format excerpts from a section
 */
function formatSectionExcerpts(section: string | undefined, results: DocSearchResult[]): string {
	const lines: string[] = [];

	// Add section heading if present
	if (section) {
		if (results.length > 1) {
			lines.push(`#### Excerpts from the "${escapeMarkdown(section)}" section`);
		} else {
			lines.push(`#### Excerpt from the "${escapeMarkdown(section)}" section`);
		}
		lines.push('');
	}

	// Add all excerpts from this section
	for (const result of results) {
		// Clean up the text - remove HTML tags if any
		const cleanText = result.text
			.replace(/<[^>]*>/g, '')
			.replace(/\n\s*\n/g, '\n')
			.trim();

		lines.push(cleanText);
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Format search results grouped by product and page
 */
function formatSearchResults(query: string, results: DocSearchResult[], productFilter?: string): string {
	const lines: string[] = [];

	// Header
	const filterText = productFilter ? ` (filtered by product: ${productFilter})` : '';
	lines.push(`# Documentation Library Search Results for "${escapeMarkdown(query)}"${filterText}`);
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
			// Use the base URL (without anchor) for the page link
			lines.push(`### Results from [${escapeMarkdown(pageTitle)}](${url})${hitCount}`);
			lines.push('');

			// Group results by section and format them
			const sectionGroups = groupBySection(pageResults);

			// Format each section's excerpts
			for (const [section, sectionResults] of sectionGroups) {
				lines.push(formatSectionExcerpts(section, sectionResults));
			}
		}
	}

	// Add suggestion to use doc fetch tool
	lines.push('---');
	lines.push('');
	lines.push(`Use the "${DOC_FETCH_CONFIG.name}" tool to fetch a document from the library.`);

	return lines.join('\n');
}
