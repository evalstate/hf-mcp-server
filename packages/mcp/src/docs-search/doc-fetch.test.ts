import { describe, it, expect } from 'vitest';
import { DocFetchTool } from './doc-fetch.js';

describe('DocFetchTool', () => {
	const tool = new DocFetchTool();

	describe('URL conversion', () => {
		it('should convert basic HF docs URL to GitHub URL', () => {
			const hfUrl = 'https://huggingface.co/docs/dataset-viewer/index';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/dataset-viewer/refs/heads/main/docs/source/index.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should handle URLs with fragments by removing them', () => {
			const hfUrl = 'https://huggingface.co/docs/huggingface_hub/guides/upload#faster-uploads';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/huggingface_hub/refs/heads/main/docs/source/en/guides/upload.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should handle transformers documentation', () => {
			const hfUrl = 'https://huggingface.co/docs/transformers/model_doc/bert';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/transformers/refs/heads/main/docs/source/en/model_doc/bert.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should handle diffusers documentation', () => {
			const hfUrl = 'https://huggingface.co/docs/diffusers/api/pipelines/stable_diffusion';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/diffusers/refs/heads/main/docs/source/en/api/pipelines/stable_diffusion.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should handle timm documentation with custom package name', () => {
			const hfUrl = 'https://huggingface.co/docs/timm/models';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/pytorch-image-models/refs/heads/main/hfdocs/source/models.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should default to index.md when no path is provided', () => {
			const hfUrl = 'https://huggingface.co/docs/transformers';
			const expectedUrl =
				'https://raw.githubusercontent.com/huggingface/transformers/refs/heads/main/docs/source/en/index.md';

			const result = tool.convertToGithubUrl(hfUrl);
			expect(result).toBe(expectedUrl);
		});

		it('should throw error for URLs not starting with correct prefix', () => {
			const invalidUrl = 'https://example.com/docs/something';

			expect(() => tool.convertToGithubUrl(invalidUrl)).toThrow('That was not a valid docs URL');
		});

		it('should throw error for unknown package names', () => {
			const unknownPackageUrl = 'https://huggingface.co/docs/unknown-package/guide';

			expect(() => tool.convertToGithubUrl(unknownPackageUrl)).toThrow('That was not a valid docs URL');
		});
	});
});
