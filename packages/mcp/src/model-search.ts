import { z } from "zod";
import { HfApiCall } from "./hf-api-call.js";

/** {
  "error": "\"inferenceProviders[0]\" must be one of [black-forest-labs, cohere, cerebras, fal-ai, featherless-ai, fireworks-ai, groq, hf-inference, hyperbolic, nebius, novita, nscale, replicate, sambanova, together]"
} */
// https://github.com/huggingface/huggingface_hub/blob/main/docs/source/en/guides/search.md
// Define the search parameters

export const ModelSearchDescription = 
  "Search Hugging Face Models for machine learning.";

const RESULTS_TO_RETURN = 5;

export const MODEL_SEARCH_TOOL_CONFIG = {
  name: "model_search",
  description: "Search Hugging Face Models. Returns model information in JSON format.",
  schema: z.object({
    search: z.string().min(1, "Search query is required"),
    limit: z.number().int().positive().default(RESULTS_TO_RETURN),
    sort: z.enum(["trendingScore", "downloads", "likes"]).default("trendingScore"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  }),
  annotations: {
    title: "Model Search",
    destructiveHint: false,
    readOnlyHint: true,
    openWorldHint: true,
  }
} as const;

export type ModelSearchParams = z.infer<typeof MODEL_SEARCH_TOOL_CONFIG.schema>;

// Define internal params type for API call
interface ModelApiParams {
  search: string;
  limit: string;
  sort: string;
  direction: string;
  full: string;
  config: string;
}

// Define the model search service
export class ModelSearchTool extends HfApiCall<ModelApiParams, any> {
  /**
   * Creates a new model search service
   * @param hfToken Optional Hugging Face token for API access
   * @param apiUrl The URL of the Hugging Face models API
   */
  constructor(
    hfToken?: string,
    apiUrl = "https://huggingface.co/api/models"
  ) {
    super(apiUrl,hfToken);
  }

  async search(params: ModelSearchParams): Promise<any> {
    try {
      // Build the query parameters
      const queryParams: Record<string, string> = {
        search: params.search,
        limit: params.limit.toString(),
        sort: params.sort,
        direction: "-1", // trending only supports -1
        full: "false",
        config: "false",
      };

      console.log("Making request to:", `${this.apiUrl}?${new URLSearchParams(queryParams)}`);
      
      // Make the API request and return the raw JSON results
      return await this.fetchFromApi<any>(this.buildUrl(queryParams));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search for models: ${error.message}`);
      }
      throw error;
    }
  }
}
