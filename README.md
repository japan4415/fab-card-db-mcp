# Flesh and Blood Card Database MCP Server

> **Breaking Change (MCP 2026-07-28)**: This server has migrated to the MCP 2026-07-28 protocol revision. Legacy SSE endpoints (`/sse`, `/sse/message`) have been removed. Clients must use the Streamable HTTP endpoint (`/mcp`). The `initialize` handshake and session management have been removed from the protocol; the server is now fully stateless. Clients using older MCP protocol versions will not be able to connect.

A Model Context Protocol (MCP 2026-07-28) server for searching and retrieving information about Flesh and Blood Trading Card Game (FAB TCG) cards. This server is deployed on Cloudflare Workers as a stateless Streamable HTTP service and provides tools for card search, print variation lookup, card detail retrieval, and product catalog browsing.

## CardVault API Migration Status

The official FAB card database has moved to `cardvault.fabtcg.com` and uses a new API host (`api.cardvault.fabtcg.com`).

- Analysis date: 2026-03-07
- Investigation + migration design: [`docs/cardvault-api-analysis.md`](docs/cardvault-api-analysis.md)
- Implementation status: `search_fab_cards` / `get_fab_card_prints` / `get_card_detail` / `get_fab_products` now use CardVault API (`api.cardvault.fabtcg.com`)

## Features

This MCP server provides the following tools. All tools return structured output via `structuredContent` (in addition to the `content` text fallback), conforming to their declared `outputSchema`.

### 1. Search FaB Cards (`search_fab_cards`)

Search for Flesh and Blood cards by name. Returns a structured array of matching cards, including:
- Card ID and name
- Card images
- Card attributes (pitch, cost, power, defense)
- Card text and type information
- Links to the official card page

### 2. Get FaB Card Prints (`get_fab_card_prints`)

Retrieve all print variations of a specific card using its card ID. Returns a structured array of prints, including:
- Print ID and associated card ID
- Print name and display name
- Print images (small, normal, large sizes)
- Layout information
- Finish types available

### 3. Get Card Detail (`get_card_detail`)

Get detailed information about a specific card, including non-English text. Returns a structured object containing:
- Complete card data in English and Japanese (when available)
- Card attributes (pitch, power, defense, cost)
- Publication details (set, rarity, artist)
- All available card variations

### 4. Get FaB Products (`get_fab_products`)

Retrieve product groups from `cardvault.fabtcg.com/products`. Returns a structured object containing:
- Product group name and type
- Release dates
- Nested product entries (slug, language, printed date)
- Pagination metadata (`next`, `previous`, `nextPage`, `previousPage`)

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
   yarn install
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

The server exposes the following endpoints:
- `POST /mcp` - Streamable HTTP MCP endpoint (MCP 2026-07-28)
- `GET /.well-known/mcp.json` - MCP server discovery manifest

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

This server uses the MCP 2026-07-28 Streamable HTTP transport. Clients that support this protocol revision can connect to:

- **Streamable HTTP endpoint**: `https://fab-card-db-mcp.discord.jp/mcp`
- **Discovery manifest**: `https://fab-card-db-mcp.discord.jp/.well-known/mcp.json`

MCP 2026-07-28 compliant clients can discover the server automatically via the `.well-known/mcp.json` manifest, which advertises the `/mcp` endpoint.

> **Note**: Legacy SSE-based connections (`/sse`) are no longer supported. Clients must use the Streamable HTTP endpoint.

## License

See the [LICENSE](LICENSE) file for details.
