import { z } from 'zod';


export const DOC_FETCH_CONFIG = {
    name: 'fetch_hf_doc',
    description:
        'Fetch Hugging Face documentation.', // TODO -- test description
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
 */
export class DocFetchTool  {

    /**
     * @param query Search query string (e.g. "llama", "attention")
     */
    fetch(url: string,): string {
        try {
            if (!url) return 'No query';
            return url;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch document: ${error.message}`);
            }
            throw error;
        }
    }
}


