import type { RequestInit } from 'node-fetch';
import fetch from 'node-fetch';

/**
 * Base API client for Hugging Face HTTP APIs
 * 
 * @template TParams - Type for API parameters
 * @template TResponse - Type for API response
 */
export class HfApiCall<TParams = Record<string, string | undefined>, TResponse = unknown> {
	protected readonly apiUrl: string;
	protected readonly hfToken: string | undefined;

	/** nb reversed order from superclasses on basis that hfToken is more likely to be configured */
	constructor(apiUrl: string, hfToken?: string) {
		this.apiUrl = apiUrl;
		this.hfToken = hfToken;
	}

	/**
	 * Fetches data from the API with proper error handling and authentication
	 * 
	 * @template T - Response type (defaults to TResponse)
	 * @param url - The URL to fetch from
	 * @param options - Fetch options
	 * @returns The parsed JSON response
	 */
	protected async fetchFromApi<T = TResponse>(url: URL | string, options?: RequestInit): Promise<T> {
		try {
			const headers = {
				'Content-Type': 'application/json',
				...(options?.headers || {}),
			} as Record<string, string>;

			if (this.hfToken) {
				headers['Authorization'] = `Bearer ${this.hfToken}`;
			}

			const response = await fetch(url.toString(), {
				...options,
				headers,
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return (await response.json()) as T;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`API request failed: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Builds a URL with query parameters
	 * 
	 * @param params - Key-value pairs of query parameters
	 * @returns A URL object with the query parameters appended
	 */
	protected buildUrl(params: TParams): URL {
		const url = new URL(this.apiUrl);

		// Type assertion needed since TParams might be a custom interface
		// that doesn't exactly match Record<string, string | undefined>
		for (const [key, value] of Object.entries(params as Record<string, string | undefined>)) {
			if (value !== undefined) {
				url.searchParams.append(key, value);
			}
		}

		return url;
	}

	/**
	 * Builds a URL with the given parameters and makes an API request
	 * 
	 * @template T - Response type (defaults to TResponse)
	 * @param params - The parameters to include in the URL
	 * @param options - Additional fetch options
	 * @returns The parsed JSON response
	 */
	protected async callApi<T = TResponse>(params: TParams, options?: RequestInit): Promise<T> {
		const url = this.buildUrl(params);
		return this.fetchFromApi<T>(url, options);
	}
}
