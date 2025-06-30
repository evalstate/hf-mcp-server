import { describe, it, expect } from 'vitest';
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
});