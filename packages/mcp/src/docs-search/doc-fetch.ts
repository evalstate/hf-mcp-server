import { z } from 'zod';
import { DOC_MAPPINGS } from './doc-mappings.js';

export const DOC_FETCH_CONFIG = {
	name: 'fetch_hf_doc',
	description: 'Fetch Hugging Face documentation content from its source markdown file',
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

/**
 * Return a (usually) markdown document for a Doc URL
 *
 * There were a few different options for this...
 * 1) Return the HTML directly. Good option would include any post-processing (but prefer markdown)
 * 2) Get the HTML and convert to markdown
 * 3) Get the HTML and follow the GitHub link to get the raw markdown file
 * 4) Use a mapping.
 *
 * There is also the risk that the GitHub HEAD is newer than the indexed version. Will leave as is for now
 * but might want to reconsider this. Mappings were built from:
 * https://github.com/huggingface/doc-builder/blob/main/.github/workflows/build_embeddings.yml
 *
 */
export class DocFetchTool {
	/**
	 * Convert HF docs URL to GitHub raw content URL
	 */
	convertToGithubUrl(hfUrl: string): string {
		// Validate URL format
		if (!hfUrl.startsWith('https://huggingface.co/docs/')) {
			throw new Error('That was not a valid docs URL');
		}

		// Remove the base URL and any fragment identifier
		const urlPath = hfUrl.replace('https://huggingface.co/docs/', '').split('#')[0] || '';

		// Extract package name and path
		const parts = urlPath.split('/');
		const packageName = parts[0] || '';

		// Check if package exists in mapping
		const mapping = DOC_MAPPINGS[packageName];
		if (!mapping) {
			throw new Error('Not a valid Hugging Face document URL');
		}

		// Build the file path
		const remainingPath = parts.slice(1).join('/');
		const filePath = remainingPath ? `${remainingPath}.md` : 'index.md';

		// Construct GitHub raw URL
		const githubUrl = `https://raw.githubusercontent.com/${mapping.repo_id}/refs/heads/main/${mapping.doc_folder}/${filePath}`;

		return githubUrl;
	}

	/**
	 * Fetch markdown content from GitHub
	 */
	async fetch(url: string): Promise<string> {
		try {
			const githubUrl = this.convertToGithubUrl(url);

			const response = await fetch(githubUrl);

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
