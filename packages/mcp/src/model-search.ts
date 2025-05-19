import { z } from "zod";
import { listModels, type ModelEntry } from "@huggingface/hub";
import type { PipelineType } from "@huggingface/hub";
import { formatDate, formatNumber } from "./model-utils.js";

export const ModelSearchDescription = "Search Hugging Face Models for machine learning.";

// Model Search Tool Configuration
export const MODEL_SEARCH_TOOL_CONFIG = {
  name: "model_search",
  description: "Find ML models on Hugging Face by name, author, task type, or library. Returns detailed info about matching models including downloads, likes, tags, and direct links.",
  schema: z.object({
    query: z.string().optional().describe("Search term for finding models by name or description"),
    author: z.string().optional().describe("Organization or user who created the model (e.g., 'google', 'meta-llama', 'microsoft')"),
    task: z.string().optional().describe("Model task type (e.g., 'text-generation', 'image-classification', 'translation')"),
    library: z.string().optional().describe("Framework the model uses (e.g., 'transformers', 'diffusers', 'timm')"),
    limit: z.number().min(1).max(100).optional().default(20).describe("Maximum number of results to return (1-100)"),
    sort: z.enum(["trendingScore", "downloads", "likes", "createdAt"]).optional().default("trendingScore")
      .describe("How to order results (trending, download count, likes, or creation date)"),
  }),
  annotations: {
    title: "Model Search",
    destructiveHint: false,
    readOnlyHint: true,
    openWorldHint: true,
  }
} as const;

// Define search parameter types
export type ModelSearchParams = z.infer<typeof MODEL_SEARCH_TOOL_CONFIG.schema>;

// Extended ModelEntry interface to include more fields we want
interface ExtendedModelEntry extends ModelEntry {
  author?: string;
  library_name?: string;
  tags?: string[];
  createdAt?: string;
  downloadsAllTime?: number;
  pipeline_tag?: string;
}

// Define common fields we want to retrieve from the API
const ADDITIONAL_FIELDS = [
  "author",
  "library_name", 
  "tags",
  "downloadsAllTime"
] as any[];

/**
 * Service for searching Hugging Face Models using the official huggingface.js library
 */
export class ModelSearchTool {
  private readonly hubUrl?: string;
  private readonly accessToken?: string;

  /**
   * Creates a new model search service
   * @param hfToken Optional Hugging Face token for API access
   * @param hubUrl Optional custom hub URL
   */
  constructor(
    hfToken?: string,
    hubUrl?: string
  ) {
    this.accessToken = hfToken;
    this.hubUrl = hubUrl;
  }

  /**
   * Search for models with detailed parameters
   */
  async searchWithParams(params: ModelSearchParams): Promise<string> {
    try {
      // Convert our params to the format expected by the hub library
      const searchParams: {
        query?: string;
        owner?: string;
        task?: PipelineType;
        tags?: string[];
      } = {};

      // Handle query parameter
      if (params.query) {
        searchParams.query = params.query;
      }
      
      if (params.author) {
        searchParams.owner = params.author;
      }
      
      if (params.task) {
        searchParams.task = params.task as PipelineType;
      }

      // Add library as a tag filter if specified
      if (params.library) {
        searchParams.tags = [params.library];
      }

      const models: ExtendedModelEntry[] = [];
      
      // Collect results from the async generator
      for await (const model of listModels({
        search: searchParams,
        additionalFields: ADDITIONAL_FIELDS,
        limit: params.limit,
        ...(this.accessToken && { credentials: { accessToken: this.accessToken } }),
        ...(this.hubUrl && { hubUrl: this.hubUrl })
      })) {
        models.push({
          ...model,
          pipeline_tag: model.task,
          createdAt: model.updatedAt.toISOString(),
        } as ExtendedModelEntry);
      }
      
      // Sort results based on the sort parameter
      const sortBy = params.sort || "trendingScore";
      this.sortModels(models, sortBy, "desc");
      
      if (models.length === 0) {
        return `No models found for the given criteria.`;
      }
      
      return formatSearchResults(models, params);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for models: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Simple search by text query (convenience method)
   */
  async searchByQuery(query: string, limit: number = 20): Promise<string> {
    return this.searchWithParams({ query, limit, sort: "trendingScore" });
  }

  /**
   * Search by author/organization
   */
  async searchByAuthor(author: string, limit: number = 20): Promise<string> {
    return this.searchWithParams({ author, limit, sort: "trendingScore" });
  }

  /**
   * Search by task
   */
  async searchByTask(task: string, limit: number = 20): Promise<string> {
    return this.searchWithParams({ task, limit, sort: "trendingScore" });
  }

  /**
   * Search by library
   */
  async searchByLibrary(library: string, limit: number = 20): Promise<string> {
    return this.searchWithParams({ library, limit, sort: "trendingScore" });
  }

  private sortModels(models: ExtendedModelEntry[], sort: string, direction: string): void {
    const mult = direction === "desc" ? -1 : 1;
    
    models.sort((a, b) => {
      switch (sort) {
        case "downloads":
          return mult * ((b.downloads || 0) - (a.downloads || 0));
        case "likes":
          return mult * ((b.likes || 0) - (a.likes || 0));
        case "createdAt":
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return mult * (bTime - aTime);
        case "trendingScore":
        default:
          // Default sorting by downloads as a proxy for trending
          return mult * ((b.downloads || 0) - (a.downloads || 0));
      }
    });
  }
}

// Formatting Function
function formatSearchResults(
  models: ExtendedModelEntry[], 
  params: Partial<ModelSearchParams>
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
    const [author, name] = model.name.includes('/') ? model.name.split('/') : ['', model.name];
    
    r.push(`## ${model.name}`);
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
    if (model.updatedAt && model.updatedAt.toISOString() !== model.createdAt) {
      r.push(`**Updated:** ${formatDate(model.updatedAt.toISOString())}`);
    }
    
    r.push(`**Link:** [https://hf.co/${model.name}](https://hf.co/${model.name})`);
    r.push("");
    r.push("---");
    r.push("");
  }
  
  return r.join("\n");
}
