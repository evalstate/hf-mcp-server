import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocSearchTool } from './docs-semantic-search.js';

// Mock the fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe('DocSearchTool', () => {
	let docSearchTool: DocSearchTool;

	beforeEach(() => {
		docSearchTool = new DocSearchTool();
		vi.clearAllMocks();
	});

	describe('search', () => {
		it('should return "No query provided" when query is empty', async () => {
			const result = await docSearchTool.search('');
			expect(result).toBe('No query provided');
		});

		it('should return no results message when API returns empty array', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve([]),
			});

			const result = await docSearchTool.search('nonexistent');
			expect(result).toBe(`No documentation found for query 'nonexistent'`);
		});

		it('should return no results message with product filter', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve([]),
			});

			const result = await docSearchTool.search('nonexistent', 'hub');
			expect(result).toBe(`No documentation found for query 'nonexistent' in product 'hub'`);
		});

		it('should format results grouped by product and page', async () => {
			const sampleResults = [
				{
					text: 'Download a comprehensive CSV file containing analytics',
					product: 'hub',
					heading1: 'Analytics',
					source_page_url: 'https://huggingface.co/docs/hub/enterprise-hub-analytics#export-analytics-as-csv',
					source_page_title: 'Enterprise-hub-analytics',
					heading2: 'Export Analytics as CSV',
				},
				{
					text: 'View analytics for your repositories',
					product: 'hub',
					heading1: 'Analytics',
					source_page_url: 'https://huggingface.co/docs/hub/enterprise-hub-analytics#export-analytics-as-csv',
					source_page_title: 'Enterprise-hub-analytics',
					heading2: 'View Analytics',
				},
				{
					text: 'In this quickstart, you will learn how to use the dataset viewer REST API',
					product: 'dataset-viewer',
					heading1: 'Quickstart',
					source_page_url: 'https://huggingface.co/docs/dataset-viewer/quick_start#quickstart',
					source_page_title: 'Quick start',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('analytics');

			// Check header
			expect(result).toContain('# Documentation Search Results for "analytics"');
			expect(result).toContain('Found 3 results');

			// Check product grouping - hub should come before dataset-viewer (hub has 2 results, dataset-viewer has 1)
			const hubIndex = result.indexOf('## Results for Product: hub');
			const datasetViewerIndex = result.indexOf('## Results for Product: dataset-viewer');
			expect(hubIndex).toBeLessThan(datasetViewerIndex);
			expect(hubIndex).toBeGreaterThan(-1);
			expect(datasetViewerIndex).toBeGreaterThan(-1);

			// Check that result counts are shown
			expect(result).toContain('## Results for Product: hub (2 results)');
			expect(result).toContain('## Results for Product: dataset-viewer (1 results)');

			// Check page links
			expect(result).toContain('### Results from [Analytics](https://huggingface.co/docs/hub/enterprise-hub-analytics#export-analytics-as-csv)');
			expect(result).toContain('### Results from [Quickstart](https://huggingface.co/docs/dataset-viewer/quick_start#quickstart)');

			// Check excerpts with heading2
			expect(result).toContain('**Excerpt from "Export Analytics as CSV":**');
			expect(result).toContain('**Excerpt from "View Analytics":**');

			// Check excerpt content appears as plain text
			expect(result).toContain('Download a comprehensive CSV file containing analytics');
			expect(result).toContain('View analytics for your repositories');
			expect(result).toContain('In this quickstart, you will learn how to use the dataset viewer REST API');

			// Check footer
			expect(result).toContain('Use the "fetch_hf_doc" tool to download a specific document.');
		});

		it('should handle results without heading2', async () => {
			const sampleResults = [
				{
					text: 'This is a simple text without heading2',
					product: 'transformers',
					heading1: 'Introduction',
					source_page_url: 'https://huggingface.co/docs/transformers/index',
					source_page_title: 'Transformers',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('transformers');

			// Should not contain "Excerpt from" when heading2 is missing
			expect(result).not.toContain('**Excerpt from');
			expect(result).toContain('This is a simple text without heading2');
		});

		it('should properly escape markdown special characters', async () => {
			const sampleResults = [
				{
					text: 'Text with [brackets] and *asterisks* and _underscores_',
					product: 'hub',
					heading1: 'Special * Characters',
					source_page_url: 'https://huggingface.co/docs/hub/test',
					source_page_title: 'Test',
					heading2: 'Section with [brackets]',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('special');

			// Check that special characters are escaped in headings and page titles
			expect(result).toContain('Special \\* Characters');
			// Note: heading2 appears in bold text, which doesn't get escaped
			expect(result).toContain('"Section with [brackets]"');
		});

		it('should clean HTML tags from text', async () => {
			const sampleResults = [
				{
					text: 'Text with <div class="test">HTML tags</div> and <img src="test.png" alt="image"/>',
					product: 'hub',
					heading1: 'HTML Test',
					source_page_url: 'https://huggingface.co/docs/hub/html-test',
					source_page_title: 'HTML Test',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('html');

			// HTML tags should be removed
			expect(result).toContain('Text with HTML tags and');
			expect(result).not.toContain('<div');
			expect(result).not.toContain('<img');
		});

		it('should sort multiple products and pages correctly by count', async () => {
			const sampleResults = [
				// Hub has 3 results (should be first)
				{
					text: 'Result from hub page 1 - first',
					product: 'hub',
					heading1: 'Page 1',
					source_page_url: 'https://huggingface.co/docs/hub/page1',
					source_page_title: 'Page 1',
				},
				{
					text: 'Result from hub page 1 - second',
					product: 'hub',
					heading1: 'Page 1',
					source_page_url: 'https://huggingface.co/docs/hub/page1',
					source_page_title: 'Page 1',
				},
				{
					text: 'Result from hub page 2',
					product: 'hub',
					heading1: 'Page 2',
					source_page_url: 'https://huggingface.co/docs/hub/page2',
					source_page_title: 'Page 2',
				},
				// Transformers has 1 result (should be second)
				{
					text: 'Result from transformers',
					product: 'transformers',
					heading1: 'Transformers Page',
					source_page_url: 'https://huggingface.co/docs/transformers/page1',
					source_page_title: 'Transformers',
				},
				// Datasets has 1 result (should be third)
				{
					text: 'Result from datasets',
					product: 'datasets',
					heading1: 'Datasets Page',
					source_page_url: 'https://huggingface.co/docs/datasets/page1',
					source_page_title: 'Datasets',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('test');

			// Check product order by count: hub (3) > transformers (1) = datasets (1) 
			const hubIndex = result.indexOf('## Results for Product: hub');
			const transformersIndex = result.indexOf('## Results for Product: transformers');
			const datasetsIndex = result.indexOf('## Results for Product: datasets');

			expect(hubIndex).toBeLessThan(transformersIndex);
			expect(hubIndex).toBeLessThan(datasetsIndex);

			// Check that hub shows total count
			expect(result).toContain('## Results for Product: hub (3 results)');
			
			// Check page order within hub product: page1 (2 results) should come before page2 (1 result)
			const page1Index = result.indexOf('https://huggingface.co/docs/hub/page1');
			const page2Index = result.indexOf('https://huggingface.co/docs/hub/page2');
			expect(page1Index).toBeLessThan(page2Index);

			// Check that page1 shows its multiple results count
			expect(result).toContain('### Results from [Page 1](https://huggingface.co/docs/hub/page1) (2 results)');
		});

		it('should include product filter in API call when provided', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve([]),
			});

			await docSearchTool.search('test', 'hub');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('q=test&product=hub'),
				expect.any(Object)
			);
		});

		it('should handle API errors gracefully', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			await expect(docSearchTool.search('test')).rejects.toThrow('Failed to search documentation:');
		});
	});

	describe('groupResults', () => {
		it('should group results by product and page URL', async () => {
			const sampleResults = [
				{
					text: 'Result 1',
					product: 'hub',
					heading1: 'Page 1',
					source_page_url: 'https://example.com/page1',
					source_page_title: 'Page 1',
				},
				{
					text: 'Result 2',
					product: 'hub',
					heading1: 'Page 1',
					source_page_url: 'https://example.com/page1',
					source_page_title: 'Page 1',
				},
				{
					text: 'Result 3',
					product: 'transformers',
					heading1: 'Page 2',
					source_page_url: 'https://example.com/page2',
					source_page_title: 'Page 2',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(sampleResults),
			});

			const result = await docSearchTool.search('test');

			// Verify grouping structure in output
			expect(result).toContain('## Results for Product: hub');
			expect(result).toContain('## Results for Product: transformers');
			
			// Verify that both results from the same page are together
			const result1Index = result.indexOf('Result 1');
			const result2Index = result.indexOf('Result 2');
			const result3Index = result.indexOf('Result 3');
			
			// Results 1 and 2 should be close together (same page)
			expect(Math.abs(result2Index - result1Index)).toBeLessThan(100);
			// Result 3 should be further away (different product)
			expect(Math.abs(result3Index - result1Index)).toBeGreaterThan(50);
		});
	});
});