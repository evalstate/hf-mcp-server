import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SpaceSearchResult } from '../dist/space-search.js';
import { assert } from 'console';
import { experimental_patchConfig } from 'wrangler';

describe('SpaceSearchService', () => {
	let space: SpaceSearchResult[];
	function loadTestData(filename: string) {
		const filePath = path.join(__dirname, '../test/fixtures', filename);
		const fileContent = readFileSync(filePath, 'utf-8');
		return JSON.parse(fileContent) as SpaceSearchResult[];
	}

	beforeEach(() => {
		space = loadTestData('space-result.json');
	});

	afterEach(() => {});

	it('read the test file', () => {
		expect('evalstate').toBe(space[0].author);
	});

	it('picked up other results', () => {
		expect('RUNNING').toBe(space[0].runtime.stage);
		expect('Image Generation').toBe(space[0].ai_category);
		expect('Genrate images').includes(space[0].ai_short_description);
	});
});
