# Flesh and Blood Card Database MCP Server

A Model Context Protocol (MCP) server for searching and retrieving information about Flesh and Blood Trading Card Game (FAB TCG) cards. This server is deployed on Cloudflare Workers and provides tools for card search and print variation lookup.

## Features

This MCP server provides the following tools:

### 1. Card Search (`search_fab_cards`)

Search for Flesh and Blood cards by name. Returns detailed information about matching cards, including:
- Card ID and name
- Card images
- Card attributes (pitch, cost, power, defense)
- Card text and type information
- Links to the official card page

### 2. Print Variations Lookup (`get_fab_card_prints`)

Retrieve all print variations of a specific card using its card ID. Returns information such as:
- Print ID and associated card ID
- Print name and display name
- Print images (small, normal, large sizes)
- Layout information
- Finish types available

## Deployment

This project is designed to be deployed on Cloudflare Workers.

### Prerequisites

- Node.js and npm installed
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)

### Deployment Steps

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd fab-card-db-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Authenticate with Cloudflare:
   ```bash
   wrangler login
   ```

4. Deploy to Cloudflare Workers:
   ```bash
   wrangler deploy
   ```

The server will be deployed to the domain configured in wrangler.jsonc (currently `fab-card-db-mcp.discord.jp`).

## Using the MCP Server

### Endpoints

The server exposes two main endpoints:
- `/sse` or `/sse/message` - SSE-based MCP endpoint
- `/mcp` - Regular MCP endpoint

### Example Usage

When connected to an MCP client, you can use the provided tools as follows:

#### Card Search Example

```javascript
// Using the search_fab_cards tool
const searchResults = await use_mcp_tool({
  server_name: "Flesh and Blood Card Search API",
  tool_name: "search_fab_cards",
  arguments: {
    query: "Awakening"
  }
});

// Results will contain card information matching the search query
```

#### Print Variations Example

```javascript
// Using the get_fab_card_prints tool
const printVariations = await use_mcp_tool({
  server_name: "Flesh and Blood Card Search API",
  tool_name: "get_fab_card_prints",
  arguments: {
    cardId: "CARD_ID_HERE" // Replace with an actual card ID from search results
  }
});

// Results will contain all print variations for the specified card
```

## Connecting with MCP Clients

### Claude Desktop

To connect this MCP server to Claude Desktop:

1. Go to Settings > Developer > Edit Config in Claude Desktop
2. Update the configuration with:

```json
{
  "mcpServers": {
    "fab-cards": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://fab-card-db-mcp.discord.jp/sse"  // Or your deployed URL
      ]
    }
  }
}
```

3. Restart Claude Desktop to access the FAB card search tools

### Other MCP Clients

For other MCP clients, configure them to connect to:
- `https://fab-card-db-mcp.discord.jp/sse` (for SSE-based connections)
- `https://fab-card-db-mcp.discord.jp/mcp` (for regular MCP connections)

## License

See the [LICENSE](LICENSE) file for details.
