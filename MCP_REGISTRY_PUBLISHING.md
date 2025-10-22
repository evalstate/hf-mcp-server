# MCP Registry Publishing Setup

This document explains how the Hugging Face MCP Server is configured for automated publishing to the Model Context Protocol (MCP) Registry.

## Overview

The server is configured to support **multiple authentication methods**:

1. **Anonymous/Public Access** - OAuth flow via `https://huggingface.co/mcp?login`
2. **Token-based Authentication** - Direct access with HF token via `https://huggingface.co/mcp`
3. **Local Package Installation** - Via npm package `@llmindset/hf-mcp-server`

## Files Created/Modified

### 1. `server.json` (NEW)
The MCP registry metadata file that describes how to connect to this server. It includes:
- Two remote endpoints for different authentication methods
- NPM package configuration for local installation
- Server metadata (name, description, version)

**Key Features:**
- Supports both OAuth login (`?login` URL) and token-based auth (Authorization header)
- Description is under 100 characters (schema requirement)
- Uses `io.github.huggingface` namespace for GitHub OIDC authentication

### 2. `packages/app/package.json` (MODIFIED)
Added the `mcpName` field required for NPM package validation:
```json
{
  "mcpName": "io.github.huggingface/hf-mcp-server"
}
```

This allows the MCP registry to verify package ownership by checking that the published NPM package contains this field matching the server name.

### 3. `.github/workflows/publish-mcp-registry.yml` (NEW)
Automated GitHub Actions workflow that:
- Triggers on version tags (e.g., `v0.2.31`)
- Waits for the NPM package to be published
- Updates server.json with the new version
- Authenticates to MCP registry using GitHub OIDC
- Publishes the server to the registry

## How It Works

### Authentication Flow
The workflow uses **GitHub OIDC** authentication, which:
- Requires no secrets (uses GitHub's identity provider)
- Only works for `io.github.*` namespaced servers
- Automatically verifies repository ownership

### Publishing Flow
1. Your existing `release.yml` workflow publishes to npm
2. The new `publish-mcp-registry.yml` workflow:
   - Waits up to 5 minutes for npm package availability
   - Updates server.json version to match the git tag
   - Authenticates with MCP registry via GitHub OIDC
   - Publishes the server metadata

### Version Synchronization
The workflow automatically syncs versions:
```bash
# Git tag: v0.2.31
# → server.json version: 0.2.31
# → packages[0].version: 0.2.31
```

## Testing the Setup

### Validate server.json locally
```bash
python3 << 'PYEOF'
import json
import jsonschema

with open('server.schema.json', 'r') as f:
    schema = json.load(f)
with open('server.json', 'r') as f:
    data = json.load(f)

validator = jsonschema.Draft202012Validator(schema)
errors = list(validator.iter_errors(data))
if errors:
    print("✗ Validation failed:")
    for error in errors:
        print(f"  - {error.message}")
else:
    print("✓ server.json is valid!")
PYEOF
```

### Manual publish (if needed)
```bash
# Install the publisher CLI
brew install mcp-publisher
# OR
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

# Login with GitHub
./mcp-publisher login github

# Publish
./mcp-publisher publish
```

## Next Release

When you create the next release:

1. **Run your existing release workflow** (creates tag, publishes to npm)
2. **The MCP registry workflow runs automatically** - no action needed!
3. **Verify publication** at https://registry.modelcontextprotocol.io

Or search for your server:
```bash
curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.huggingface/hf-mcp-server"
```

## Multiple Authentication Methods in server.json

The `remotes` array contains two entries:

```json
{
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://huggingface.co/mcp?login",
      "headers": []
    },
    {
      "type": "streamable-http",
      "url": "https://huggingface.co/mcp",
      "headers": [
        {
          "name": "Authorization",
          "description": "Hugging Face API token for authentication",
          "placeholder": "Bearer hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          "isRequired": false,
          "isSecret": true
        }
      ]
    }
  ]
}
```

This allows clients to choose:
- **First option**: OAuth flow (URL includes `?login` parameter)
- **Second option**: Direct token auth (Authorization header)

Clients can present both options to users and let them choose their preferred authentication method.

## Troubleshooting

### "Package validation failed"
- Ensure `@llmindset/hf-mcp-server` is published to npm
- Verify the package includes the `mcpName` field in package.json
- Check that `mcpName` matches exactly: `io.github.huggingface/hf-mcp-server`

### "Authentication failed"
- Verify the workflow has `id-token: write` permission
- Ensure the repository is `github.com/huggingface/hf-mcp-server`
- The namespace `io.github.huggingface` must match the GitHub organization

### "Version mismatch"
- The workflow auto-updates server.json from the git tag
- If manual intervention is needed, update both `version` and `packages[0].version`

## Resources

- [MCP Registry Publishing Guide](https://raw.githubusercontent.com/modelcontextprotocol/registry/refs/heads/main/docs/guides/publishing/publish-server.md)
- [GitHub Actions Publishing Guide](https://raw.githubusercontent.com/modelcontextprotocol/registry/refs/heads/main/docs/guides/publishing/github-actions.md)
- [server.json Schema](https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json)
