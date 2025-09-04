import { z } from 'zod';
import TurndownService from 'turndown';
import { estimateTokens } from '../utilities.js';

export const DOC_FETCH_CONFIG = {
	name: 'hf_doc_fetch',
	description:
		'Fetch a document from the Hugging Face or Gradio documentation library. For large documents, use offset to get subsequent chunks.',
	schema: z.object({
		doc_url: z.string().max(200, 'Query too long').describe('Documentation URL (Hugging Face or Gradio)'),
		offset: z
			.number()
			.min(0)
			.optional()
			.describe('Token offset for large documents (use the offset from truncation message)'),
	}),
	annotations: {
		title: 'Fetch a document from the Hugging Face documentation library',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

export type DocFetchParams = z.infer<typeof DOC_FETCH_CONFIG.schema>;

export class DocFetchTool {
	private turndownService: TurndownService;

	constructor() {
		this.turndownService = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced',
		});
		this.turndownService.remove('head');
		this.turndownService.remove('script');
		this.turndownService.remove((node) => {
			if (node.nodeName === 'a' && node.innerHTML.includes('<!-- HTML_TAG_START -->')) {
				return true;
			}
			return false;
		});
	}

	/**
	 * Validate HF docs URL
	 */
	validateUrl(hfUrl: string): void {
		try {
			const url = new URL(hfUrl);
			if (url.protocol !== 'https:') {
				throw new Error('That was not a valid documentation URL');
			}

			const hostname = url.hostname.toLowerCase();
			const isHfDocs =
				(hostname === 'huggingface.co' || hostname === 'www.huggingface.co') && url.pathname.startsWith('/docs/');
			const isGradio = hostname === 'gradio.app' || hostname === 'www.gradio.app';

			if (!isHfDocs && !isGradio) {
				throw new Error('That was not a valid documentation URL');
			}
		} catch {
			throw new Error('That was not a valid documentation URL');
		}
	}

	/**
	 * Fetch content from Hugging Face docs URL and convert HTML to Markdown
	 */
	async fetch(params: DocFetchParams): Promise<string> {
		try {
			this.validateUrl(params.doc_url);

			const response = await fetch(params.doc_url);

			if (!response.ok) {
				throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
			}

			const htmlContent = await response.text();

			// Convert HTML to Markdown
			const fullMarkdownContent = this.turndownService.turndown(htmlContent);

			// Apply chunking logic
			return this.applyChunking(fullMarkdownContent, params.offset || 0);
		} catch (error) {
			throw new Error(`Failed to fetch document: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Apply chunking logic to markdown content
	 */
	private applyChunking(markdownContent: string, offset: number): string {
		const totalTokens = estimateTokens(markdownContent);
		const maxTokensPerChunk = 7500;

		// Calculate character positions based on tokens
		const totalChars = markdownContent.length;
		const charsPerToken = totalChars / totalTokens;
		const startChar = Math.floor(offset * charsPerToken);

		// If offset is beyond document, return error message
		if (startChar >= totalChars) {
			return `Error: Offset ${offset} is beyond the document length (${totalTokens} tokens total).`;
		}

		// If document is small enough and no offset, return as-is
		if (totalTokens <= maxTokensPerChunk && offset === 0) {
			return markdownContent;
		}

		const maxCharsPerChunk = Math.floor(maxTokensPerChunk * charsPerToken);
		const endChar = Math.min(startChar + maxCharsPerChunk, totalChars);
		const chunk = markdownContent.slice(startChar, endChar);

		// Calculate next offset
		const nextOffset = offset + estimateTokens(chunk);
		const hasMore = nextOffset < totalTokens;

		let result = chunk;

		// Add truncation message if there's more content
		if (hasMore) {
			result += `\n\n=== DOCUMENT TRUNCATED. CALL ${DOC_FETCH_CONFIG.name} WITH AN OFFSET OF ${nextOffset} FOR THE NEXT CHUNK ===`;
		}

		return result;
	}
}
