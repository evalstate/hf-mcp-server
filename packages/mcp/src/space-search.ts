import { z } from "zod";

// Token will be passed via constructor instead of global config

// Define the SearchResult interface
interface SearchResult {
  id: string;
  sdk: string;
  likes?: number;
  downloads?: number;
  title?: string;
  description?: string;
  shortDescription?: string;
  author: string;
  authorData?: {
    fullname?: string;
  };
  semanticRelevancyScore?: number; // Score from semantic search API
  emoji?: string; // Emoji for the space
}

// Default number of results to return
const RESULTS_TO_RETURN = 10;

export const SemanticSearchDescription = 
  "Search Hugging Face Spaces with semantic search.";

export const SEMANTIC_SEARCH_TOOL_CONFIG = {
  name: "space_search",
  description: "Find Hugging Face Spaces with semantic search. " +
    "Results are returned in a markdown table. " +
    "Include links to the space when presenting the results.",
  schema: z.object({
    query: z.string().min(1, "Search query is required"),
    limit: z.number().optional().default(RESULTS_TO_RETURN),
  }),
  annotations: {
    title: "Semantic Space Search",
    destructiveHint: false,
    readOnlyHint: true,
    openWorldHint: true,
  }
} as const;


/**
 * Service for searching Hugging Face Spaces semantically
 */
export class SemanticSearchService {
  private readonly apiUrl: string;
  private readonly hfToken: string | undefined;

  /**
   * Creates a new semantic search service
   * @param hfToken Optional Hugging Face token for API access
   * @param apiUrl The URL of the Hugging Face semantic search API
   */
  constructor(
    hfToken?: string,
    apiUrl = "https://huggingface.co/api/spaces/semantic-search"
  ) {
    this.apiUrl = apiUrl;
    this.hfToken = hfToken;
  }

  /**
   * Performs a semantic search on Hugging Face Spaces
   * @param query The search query
   * @param limit Maximum number of results to return
   * @returns An array of search results
   */
  async search(
    query: string,
    limit: number = RESULTS_TO_RETURN,
  ): Promise<SearchResult[]> {
    try {
      // Validate input before making API call
      if (!query) {
        return [];
      }
      
      if (typeof query !== 'string') {
        throw new Error('Search query must be a string');
      }

      const url =
        `${this.apiUrl}?` + new URLSearchParams({ q: query, sdk: "gradio" }).toString();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.hfToken) {
        headers["Authorization"] = `Bearer ${this.hfToken}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `Search request failed: ${response.status} ${response.statusText}`,
        );
      }

      const results = (await response.json()) as SearchResult[];

      // Filter by SDK type if specified in the API response
      // Note: We keep this filter since the API might return mixed results
      return results
        .filter((result) => result.sdk === "gradio")
        .slice(0, limit);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for spaces: ${error.message}`);
      }
      throw error;
    }
  }
}


// Create a schema validator for search parameters
export const SearchParamsSchema = SEMANTIC_SEARCH_TOOL_CONFIG.schema;

export type SearchParams = z.infer<typeof SEMANTIC_SEARCH_TOOL_CONFIG.schema>;

/**
 * Formats search results as a markdown table for MCP friendly output
 * @param results The search results to format
 * @returns A markdown formatted string with the search results
 */
export const formatSearchResults = (query:string, results: SearchResult[]): string => {
  if (results.length === 0) {
    return `No matching Hugging Face Spaces found for the query '${query}'. Try a different query.`;
  }

  let markdown = `# Space Search Results for the query '${query}'\n\n`;
  markdown += "| Space | Description | Author | ID | Relevance |\n";
  markdown += "|-------|-------------|--------|----|-----------|\n";

  for (const result of results) {
    const title = result.title || "Untitled";
    const description = result.shortDescription || result.description || "No description";
    const author = result.authorData?.fullname || result.author || "Unknown";
    const id = result.id || "";
    const emoji = result.emoji ? escapeMarkdown(result.emoji) + " " : "";
    const relevance = result.semanticRelevancyScore 
      ? (result.semanticRelevancyScore * 100).toFixed(1) + "%" 
      : "N/A";

    markdown +=
      `| ${emoji}[${escapeMarkdown(title)}](https://hf.co/spaces/${id}) ` +
      `| ${escapeMarkdown(description)} ` +
      `| ${escapeMarkdown(author)} ` +
      `| \`${escapeMarkdown(id)}\` ` +
      `| ${relevance} |\n`;
  }

  return markdown;
};

/**
 * Escapes special markdown characters in a string
 * @param text The text to escape
 * @returns The escaped text
 */
function escapeMarkdown(text: string): string {
  if (!text) return "";
  // Replace pipe characters and newlines for table compatibility
  // Plus additional markdown formatting characters for better safety
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#");
}
