import { describe, it, expect, vi } from 'vitest';
import { DocFetchTool } from './doc-fetch.js';

describe('DocFetchTool', () => {
	const tool = new DocFetchTool();

	describe('URL validation', () => {
		it('should accept valid HF docs URLs', () => {
			const validUrls = [
				'https://huggingface.co/docs/dataset-viewer/index',
				'https://huggingface.co/docs/huggingface_hub/guides/upload#faster-uploads',
				'https://huggingface.co/docs/transformers/model_doc/bert',
				'https://huggingface.co/docs/diffusers/api/pipelines/stable_diffusion',
				'https://huggingface.co/docs/timm/models',
				'https://huggingface.co/docs/transformers',
			];

			for (const url of validUrls) {
				expect(() => tool.validateUrl(url)).not.toThrow();
			}
		});

		it('should throw error for URLs not starting with correct prefix', () => {
			const invalidUrls = [
				'https://example.com/docs/something',
				'https://github.com/huggingface/transformers',
				'http://huggingface.co/docs/transformers',
				'huggingface.co/docs/transformers',
				'https://huggingface.co/models/bert-base-uncased',
			];

			for (const url of invalidUrls) {
				expect(() => tool.validateUrl(url)).toThrow('That was not a valid Hugging Face document URL');
			}
		});
	});

	describe('document chunking', () => {
		it('should return small documents without chunking', async () => {
			
			// Mock fetch to return HTML that converts to short markdown
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve('<h1>Short Document</h1><p>This is a short document.</p>'),
			});

			const result = await tool.fetch({ doc_url: 'https://huggingface.co/docs/test' });
			
			expect(result).toContain('# Short Document');
			expect(result).toContain('This is a short document');
			expect(result).not.toContain('DOCUMENT TRUNCATED');
		});

		it('should chunk large documents and show truncation message', async () => {
			// Mock fetch to return HTML that converts to long markdown
			const longHtml = '<h1>Long Document</h1>' + '<p>This is a very long sentence that will be repeated many times to create a document that exceeds the 7500 token limit for testing chunking functionality.</p>'.repeat(200);
			
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(longHtml),
			});

			const result = await tool.fetch({ doc_url: 'https://huggingface.co/docs/test' });
			
			expect(result).toContain('# Long Document');
			expect(result).toContain('DOCUMENT TRUNCATED');
			expect(result).toContain('CALL hf_doc_fetch WITH AN OFFSET OF');
		});

		it('should return subsequent chunks with offset', async () => {
			// Mock fetch to return the same long HTML
			const longHtml = '<h1>Long Document</h1>' + '<p>This is a very long sentence that will be repeated many times to create a document that exceeds the 7500 token limit for testing chunking functionality.</p>'.repeat(200);
			
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(longHtml),
			});

			// Get first chunk
			const firstChunk = await tool.fetch({ doc_url: 'https://huggingface.co/docs/test' });
			
			// Extract offset from truncation message
			const offsetMatch = firstChunk.match(/OFFSET OF (\d+)/);
			expect(offsetMatch).toBeTruthy();
			const offset = parseInt(offsetMatch?.[1] || '0', 10);

			// Get second chunk
			const secondChunk = await tool.fetch({ doc_url: 'https://huggingface.co/docs/test', offset });
			
			expect(secondChunk).not.toEqual(firstChunk);
			expect(secondChunk.length).toBeGreaterThan(0);
		});

		it('should handle offset beyond document length', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve('<h1>Short Document</h1><p>This is short.</p>'),
			});

			const result = await tool.fetch({ doc_url: 'https://huggingface.co/docs/test', offset: 10000 });
			
			expect(result).toContain('Error: Offset 10000 is beyond');
		});
	});
});