import { z } from "zod";
import { HfApiCall } from "./hf-api-call.js";
import { formatDate, formatNumber } from "./model-utils.js";

export const ModelSearchDescription = "Search Hugging Face Models for machine learning.";

// Model Search Tool Configuration
export const MODEL_SEARCH_TOOL_CONFIG = {
  name: "model_search",
  description: "Search for Machine Learning models on Hugging Face Hub. " +
    "Include model links when presenting results. " +
    "Consider tabulating results if it matches user intent.",
  schema: z.object({
    query: z.string().optional().describe("Search term for model name/description"),
    author: z.string().optional().describe("Filter by author/organization"),
    task: z.string().optional().describe("Filter by task (e.g., text-generation, image-classification)"),
    library: z.string().optional().describe("Filter by library (e.g., transformers, diffusers)"),
    sort: z.enum(["trendingScore", "downloads", "likes", "createdAt"]).optional().default("trendingScore"),
    limit: z.number().min(1).max(100).optional().default(20),
    search: z.string().optional().describe("Alternative to query - search term for model name/description"),
    direction: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
  annotations: {
    title: "Model Search",
    destructiveHint: false,
    readOnlyHint: true,
    openWorldHint: true,
  }
} as const;

// Response Interface
export interface ModelSearchResult {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  private?: boolean;
  gated?: boolean | string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  createdAt?: string;
  lastModified?: string;
}

// Define search parameter types
export type ModelSearchParams = z.infer<typeof MODEL_SEARCH_TOOL_CONFIG.schema>;

// API parameters interface
interface ModelApiParams {
  [key: string]: string;
}

/**
 * Service for searching Hugging Face Models
 */
export class ModelSearchTool extends HfApiCall<ModelApiParams, ModelSearchResult[]> {
  /**
   * Creates a new model search service
   * @param hfToken Optional Hugging Face token for API access
   * @param apiUrl The URL of the Hugging Face models API
   */
  constructor(
    hfToken?: string,
    apiUrl = "https://huggingface.co/api/models"
  ) {
    super(apiUrl, hfToken);
  }

  // Maintain backwards compatibility with the original method signature
  async search(
    query?: string,
    author?: string,
    task?: string,
    library?: string,
    sort: string = "trendingScore",
    limit: number = 20,
    direction: string = "desc"
  ): Promise<string> {
    try {
      const params: ModelApiParams = {};
      
      // Support both query and search parameters
      if (query) params.search = query;
      if (author) params.author = author;
      if (sort) params.sort = sort;
      if (limit) params.limit = limit.toString();
      if (direction) params.direction = direction;
      
      // Handle filters (task and library go into filter parameter)
      const filters: string[] = [];
      if (task) filters.push(task);
      if (library) filters.push(library);
      if (filters.length > 0) {
        params.filter = filters.join(",");
      }

      const url = this.buildUrl(params);
      const models = await this.fetchFromApi<ModelSearchResult[]>(url);
      
      if (models.length === 0) {
        return `No models found for the given criteria.`;
      }
      
      return formatSearchResults(models, { query, author, task, library });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for models: ${error.message}`);
      }
      throw error;
    }
  }

  // Add an alternative search method that accepts a params object
  async searchWithParams(params: ModelSearchParams): Promise<string> {
    return this.search(
      params.query || params.search,
      params.author,
      params.task,
      params.library,
      params.sort,
      params.limit,
      params.direction
    );
  }
}

// Formatting Function
function formatSearchResults(
  models: ModelSearchResult[], 
  params: { query?: string; author?: string; task?: string; library?: string }
): string {
  const r: string[] = [];
  
  // Build search description
  const searchTerms = [];
  if (params.query) searchTerms.push(`query "${params.query}"`);
  if (params.author) searchTerms.push(`author "${params.author}"`);
  if (params.task) searchTerms.push(`task "${params.task}"`);
  if (params.library) searchTerms.push(`library "${params.library}"`);
  
  const searchDesc = searchTerms.length > 0 
    ? ` matching ${searchTerms.join(", ")}`
    : "";
    
  r.push(`Found ${models.length} models${searchDesc}:`);
  r.push("");

  for (const model of models) {
    const [author, name] = model.id.includes('/') ? model.id.split('/') : ['', model.id];
    
    r.push(`## ${model.id}`);
    r.push("");
    
    // Basic info line
    const info = [];
    if (model.pipeline_tag) info.push(`**Task:** ${model.pipeline_tag}`);
    if (model.library_name) info.push(`**Library:** ${model.library_name}`);
    if (model.downloads) info.push(`**Downloads:** ${formatNumber(model.downloads)}`);
    if (model.likes) info.push(`**Likes:** ${model.likes}`);
    
    if (info.length > 0) {
      r.push(info.join(" | "));
      r.push("");
    }
    
    // Tags
    if (model.tags && model.tags.length > 0) {
      r.push(`**Tags:** ${model.tags.slice(0, 6).join(", ")}`);
      if (model.tags.length > 6) {
        r.push(`*and ${model.tags.length - 6} more...*`);
      }
      r.push("");
    }
    
    // Status indicators
    const status = [];
    if (model.gated) status.push("🔒 Gated");
    if (model.private) status.push("🔐 Private");
    if (status.length > 0) {
      r.push(status.join(" | "));
      r.push("");
    }
    
    // Dates
    if (model.createdAt) {
      r.push(`**Created:** ${formatDate(model.createdAt)}`);
    }
    if (model.lastModified && model.lastModified !== model.createdAt) {
      r.push(`**Updated:** ${formatDate(model.lastModified)}`);
    }
    
    r.push(`**Link:** [https://hf.co/${model.id}](https://hf.co/${model.id})`);
    r.push("");
    r.push("---");
    r.push("");
  }
  
  return r.join("\n");
}