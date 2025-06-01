import { z } from 'zod';
import { HfApiCall } from './hf-api-call.js';

export interface DuplicateSpaceParams {
  fromId: string;
  toId?: string;
  private?: boolean;
  hardware?: string;
  storageTier?: string;
  sleepTimeSeconds?: number;
  secrets?: Record<string, string>;
  variables?: Record<string, string>;
  existOk?: boolean;
  smartCopy?: boolean;
}

export interface SpaceVariable {
  key: string;
  value: string;
  description?: string;
}

export interface DuplicateSpaceResult {
  url: string;
  id: string;
  hardware: string;
  private: boolean;
  storageTier?: string;
  sleepTimeSeconds?: number;
  copiedVariables: string[];
  requiredSecrets: string[];
  warnings: string[];
}

export const DUPLICATE_SPACE_TOOL_CONFIG = {
  name: 'duplicate_space',
  description: 'Duplicate a Hugging Face Space with automatic variable copying and secret detection. Creates a copy of an existing Space with optional configuration overrides.',
  schema: z.object({
    fromId: z.string().min(1).describe('The Space ID to duplicate from (format: username/space-name)'),
    toId: z.string().optional().describe('The target Space ID (format: username/space-name). If not provided, will create in your namespace'),
    private: z.boolean().optional().describe('Whether the duplicated Space should be private'),
    hardware: z.string().optional().describe('Hardware tier for the Space (e.g., cpu-basic, cpu-upgrade, t4-small, t4-medium, a10g-small, a10g-large, a100-large). Defaults to cpu-basic'),
    storageTier: z.string().optional().describe('Storage tier for the Space'),
    sleepTimeSeconds: z.number().optional().describe('Number of seconds of inactivity before Space goes to sleep (only for paid hardware)'),
    secrets: z.record(z.string()).optional().describe('Environment secrets for the Space'),
    variables: z.record(z.string()).optional().describe('Environment variables for the Space'),
    existOk: z.boolean().optional().default(false).describe('If true, do not raise an error if target space already exists'),
    smartCopy: z.boolean().optional().default(true).describe('If true, automatically copy variables and detect required secrets'),
  }),
  annotations: {
    title: 'Duplicate Hugging Face Space',
    destructiveHint: false,
    readOnlyHint: false,
    openWorldHint: false,
  }
};

// Common patterns that indicate secret requirements
const SECRET_PATTERNS: Record<string, string[]> = {
  "OPENAI_API_KEY": ["openai", "gpt", "chatgpt"],
  "ANTHROPIC_API_KEY": ["anthropic", "claude"],
  "REPLICATE_API_TOKEN": ["replicate"],
  "HUGGINGFACE_API_KEY": ["huggingface", "hf_api"],
  "PINECONE_API_KEY": ["pinecone"],
  "SERPAPI_API_KEY": ["serpapi", "google_search"],
  "WOLFRAM_ALPHA_APPID": ["wolfram"],
  "ELEVENLABS_API_KEY": ["elevenlabs"],
  "COHERE_API_KEY": ["cohere"],
  "STABILITY_API_KEY": ["stability", "stable-diffusion"],
  "DEEPAI_API_KEY": ["deepai"],
  "ASSEMBLYAI_API_KEY": ["assemblyai"],
  "VOYAGE_API_KEY": ["voyage"],
  "GOOGLE_API_KEY": ["google", "gemini"],
  "AWS_ACCESS_KEY_ID": ["aws", "s3", "bedrock"],
  "AZURE_API_KEY": ["azure", "microsoft"],
};

export class DuplicateSpaceTool extends HfApiCall<DuplicateSpaceParams, DuplicateSpaceResult> {
  constructor(hfToken?: string) {
    super('https://huggingface.co/api', hfToken);
  }

  async getSpaceInfo(spaceId: string): Promise<{ id: string; sdk?: string; runtime?: { hardware?: string } }> {
    const url = `${this.apiUrl}/spaces/${spaceId}`;
    return this.fetchFromApi(url);
  }

  async getSpaceVariables(spaceId: string): Promise<Record<string, { value: string; description?: string }>> {
    const url = `${this.apiUrl}/spaces/${spaceId}/settings`;
    try {
      const response = await this.fetchFromApi<{ variables?: Record<string, { value: string; description?: string }> }>(url);
      return response.variables || {};
    } catch {
      // If we can't access settings (private space or no permissions), return empty
      return {};
    }
  }

  async listRepoFiles(spaceId: string): Promise<string[]> {
    const url = `${this.apiUrl}/spaces/${spaceId}/tree/main`;
    try {
      const response = await this.fetchFromApi<Array<{ path: string }>>(url);
      return response.map(item => item.path);
    } catch {
      return [];
    }
  }

  async getFileContent(spaceId: string, filename: string): Promise<string> {
    const url = `https://huggingface.co/spaces/${spaceId}/raw/main/${filename}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return '';
      return await response.text();
    } catch {
      return '';
    }
  }

  async detectRequiredSecrets(spaceId: string, copiedVariables: string[]): Promise<string[]> {
    const detectedSecrets = new Set<string>();
    const contentFiles = ["README.md", "app.py", "requirements.txt", ".env.example", "main.py", "handler.py"];
    
    const files = await this.listRepoFiles(spaceId);
    
    for (const file of files) {
      if (contentFiles.includes(file)) {
        const content = await this.getFileContent(spaceId, file);
        const lowerContent = content.toLowerCase();
        
        // Check for known secret patterns
        for (const [secretKey, patterns] of Object.entries(SECRET_PATTERNS)) {
          if (patterns.some(pattern => lowerContent.includes(pattern))) {
            detectedSecrets.add(secretKey);
          }
        }
        
        // Check for explicit secret mentions using regex
        const secretRegex = /([\w_]+_(?:KEY|TOKEN|SECRET|API|APIKEY|API_KEY|PASSWORD|PASS|PWD))/gi;
        const matches = content.match(secretRegex) || [];
        matches.forEach(match => detectedSecrets.add(match.toUpperCase()));
      }
    }
    
    // Remove any that are already in variables
    copiedVariables.forEach(varName => detectedSecrets.delete(varName));
    
    return Array.from(detectedSecrets);
  }

  async whoami(): Promise<{ name: string }> {
    const url = `${this.apiUrl}/whoami`;
    return this.fetchFromApi(url);
  }

  async duplicate(params: DuplicateSpaceParams): Promise<DuplicateSpaceResult> {
    const { 
      fromId, 
      toId, 
      private: isPrivate, 
      hardware, 
      storageTier, 
      sleepTimeSeconds, 
      secrets, 
      variables: userVariables, 
      existOk,
      smartCopy = true 
    } = params;

    const result: DuplicateSpaceResult = {
      url: '',
      id: '',
      hardware: hardware || 'cpu-basic',
      private: isPrivate || false,
      storageTier,
      sleepTimeSeconds,
      copiedVariables: [],
      requiredSecrets: [],
      warnings: [],
    };

    // Step 1: Get source space info
    try {
      await this.getSpaceInfo(fromId);
    } catch {
      throw new Error(`Source space '${fromId}' not found or you don't have access`);
    }

    // Step 2: Smart copy - get and prepare variables
    let variables = userVariables || {};
    
    if (smartCopy && !userVariables) {
      try {
        const sourceVars = await this.getSpaceVariables(fromId);
        
        if (Object.keys(sourceVars).length > 0) {
          const variablesList: SpaceVariable[] = [];
          
          for (const [key, varInfo] of Object.entries(sourceVars)) {
            // Special handling for HF_TOKEN
            if (key === "HF_TOKEN" && this.hfToken) {
              variablesList.push({
                key: "HF_TOKEN",
                value: this.hfToken,
                description: "Hugging Face token (auto-provided)"
              });
            } else {
              variablesList.push({
                key,
                value: varInfo.value,
                description: varInfo.description
              });
            }
            
            result.copiedVariables.push(key);
          }
          
          // Convert to the format expected by the API
          variables = variablesList.reduce<Record<string, string>>((acc, v) => {
            acc[v.key] = v.value;
            return acc;
          }, {});
        }
      } catch (error) {
        result.warnings.push(`Could not fetch variables: ${String(error)}`);
      }
    }

    // Step 3: Detect required secrets
    if (smartCopy) {
      try {
        result.requiredSecrets = await this.detectRequiredSecrets(fromId, result.copiedVariables);
      } catch (error) {
        result.warnings.push(`Could not analyze files for secrets: ${String(error)}`);
      }
    }

    // Step 4: Determine target ID if not provided
    let targetId = toId;
    if (!targetId) {
      try {
        const user = await this.whoami();
        const sourceName = fromId.split('/')[1];
        targetId = `${user.name}/${sourceName ?? ''}`;
      } catch {
        throw new Error('Could not determine target space ID. Please provide toId parameter.');
      }
    }

    // Step 5: Build and send the duplication request
    const url = `${this.apiUrl}/spaces/${fromId}/duplicate`;
    
    const payload: Record<string, unknown> = {
      toId: targetId,
    };
    
    if (isPrivate !== undefined) payload.private = isPrivate;
    if (hardware !== undefined) payload.hardware = hardware;
    if (storageTier !== undefined) payload.storageTier = storageTier;
    if (sleepTimeSeconds !== undefined) payload.sleepTimeSeconds = sleepTimeSeconds;
    if (secrets !== undefined) payload.secrets = secrets;
    if (Object.keys(variables).length > 0) payload.variables = variables;
    if (existOk !== undefined) payload.existOk = existOk;

    try {
      const response = await this.fetchFromApi<{ url: string }>(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      result.url = response.url;
      result.id = targetId;
    } catch (error) {
      if (error instanceof Error && error.message.includes('409') && !existOk) {
        throw new Error(`Space '${targetId}' already exists. Use existOk=true to skip this error.`);
      }
      throw error;
    }

    return result;
  }
}

export const formatDuplicateResult = (result: DuplicateSpaceResult): string => {
  const lines: string[] = [];
  
  lines.push(`# Space Duplicated Successfully! 🎉`);
  lines.push('');
  lines.push(`**Space ID:** \`${result.id}\``);
  lines.push(`**URL:** ${result.url}`);
  lines.push(`**Hardware:** ${result.hardware}`);
  lines.push(`**Visibility:** ${result.private ? 'Private' : 'Public'}`);

  if (result.storageTier) {
    lines.push(`**Storage Tier:** ${result.storageTier}`);
  }

  if (result.sleepTimeSeconds !== undefined) {
    lines.push(`**Sleep Time:** ${result.sleepTimeSeconds.toString()} seconds`);
  }

  if (result.copiedVariables.length > 0) {
    lines.push('');
    lines.push(`## Copied Variables (${result.copiedVariables.length.toString()})`);
    result.copiedVariables.forEach(v => lines.push(`- ${v}`));
  }

  if (result.requiredSecrets.length > 0) {
    lines.push('');
    lines.push(`## ⚠️ Required Secrets (${result.requiredSecrets.length.toString()})`);
    lines.push('');
    lines.push('You need to add the following secrets to your space:');
    lines.push(`1. Go to: ${result.url}/settings`);
    lines.push(`2. Navigate to 'Variables and secrets' section`);
    lines.push(`3. Add these secrets:`);
    result.requiredSecrets.forEach(s => lines.push(`   - ${s}`));
    lines.push('');
    lines.push('**Without these secrets, your space may not function properly.**');
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    result.warnings.forEach(w => lines.push(`- ${w}`));
  }

  if (result.hardware === 'cpu-basic') {
    lines.push('');
    lines.push('> **Note:** Your Space is running on the free `cpu-basic` hardware tier. It will automatically sleep after 48 hours of inactivity.');
  }

  return lines.join('\n');
};