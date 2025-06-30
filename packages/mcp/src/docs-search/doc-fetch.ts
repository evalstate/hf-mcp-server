import { z } from 'zod';

export const DOC_FETCH_CONFIG = {
	name: 'hf_doc_fetch',
	description: 'Fetch a document from the Hugging Face documentation library.',
	schema: z.object({
		doc_url: z
			.string()
			.min(28, 'Url should start with https://huggingface.co/docs/')
			.max(200, 'Query too long')
			.describe('Hugging Face documentation URL'),
	}),
	annotations: {
		title: 'Fetch a document from the Hugging Face library',
		destructiveHint: false,
		readOnlyHint: true,
		openWorldHint: true,
	},
} as const;

export type DocFetchParams = z.infer<typeof DOC_FETCH_CONFIG.schema>;

export class DocFetchTool {
	/**
	 * Validate HF docs URL
	 */
	validateUrl(hfUrl: string): void {
		if (!hfUrl.startsWith('https://huggingface.co/docs/')) {
			throw new Error('That was not a valid Hugging Face document URL');
		}
	}

	/**
	 * Fetch content from Hugging Face docs URL
	 */
	async fetch(url: string): Promise<string> {
		try {
			this.validateUrl(url);

			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
			}

			const content = await response.text();
			return content;
		} catch (error) {
			throw new Error(`Failed to fetch document: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
}
