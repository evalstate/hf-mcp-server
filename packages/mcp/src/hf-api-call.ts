export class HfApiCall<TParams, TResponse> {
  protected readonly apiUrl: string;
  protected readonly hfToken: string | undefined;

  /** nb reversed order from superclasses on basis that hfToken is more likely to be configured */
  constructor(apiUrl: string, hfToken?: string) {
    this.apiUrl = apiUrl;
    this.hfToken = hfToken;
  }

  protected async fetchFromApi<T>(
    url: URL | string,
    options?: RequestInit
  ): Promise<T> {
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(options?.headers || {})
      } as Record<string, string>;

      if (this.hfToken) {
        headers["Authorization"] = `Bearer ${this.hfToken}`;
      }

      const response = await fetch(url.toString(), {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  protected buildUrl(
    params: Record<string, string | undefined>
  ): URL {
    const url = new URL(this.apiUrl);
    Object.entries(params)
      .filter(([_, value]) => value !== undefined)
      .forEach(([key, value]) => {
        url.searchParams.append(key, value as string);
      });
    return url;
  }
}
