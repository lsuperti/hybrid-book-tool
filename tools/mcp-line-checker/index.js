#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Initialize the MCP Server
const server = new Server(
  {
    name: "line-length-checker",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the tool schema with the new tabWidth property
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_line_lengths",
        description: "Analyzes text and returns a list of lines that exceed a specified maximum width, tracking visual tab indentation.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The complete raw text draft to analyze."
            },
            maxWidth: {
              type: "number",
              description: "The maximum allowed characters per line.",
              default: 120
            },
            tabWidth: {
              type: "number",
              description: "The visual width of a tab character in spaces (e.g., 2, 4, or 8).",
              default: 4
            }
          },
          required: ["text"]
        }
      }
    ]
  };
});

// Implement the tool logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "analyze_line_lengths") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const text = request.params.arguments.text || "";
  const maxWidth = request.params.arguments.maxWidth || 120;
  const tabWidth = request.params.arguments.tabWidth || 4;

  const lines = text.split(/\r?\n/);
  const violations = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Calculate the visual length expanding tabs correctly based on their column position
    let visualLength = 0;
    let expandedLine = "";
    
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\t') {
        // A tab advances to the next tab stop
        const spacesToNextTabStop = tabWidth - (visualLength % tabWidth);
        visualLength += spacesToNextTabStop;
        expandedLine += " ".repeat(spacesToNextTabStop);
      } else {
        visualLength += 1;
        expandedLine += line[i];
      }
    }

    if (visualLength > maxWidth) {
      // Find the slice point in the ORIGINAL raw string to give the agent accurate context
      // We slice based on the expanded layout to show where the overflow physically hits
      const validPartExpanded = expandedLine.substring(0, maxWidth);
      const excessPartExpanded = expandedLine.substring(maxWidth);
      
      violations.push({
        lineNumber,
        rawLength: line.length,
        visualLength,
        excessVisualCharacters: visualLength - maxWidth,
        visualMarker: `${validPartExpanded} 🛑[OVERFLOW START]🛑 ${excessPartExpanded}`
      });
    }
  });

  const report = {
    isValid: violations.length === 0,
    totalLinesProcessed: lines.length,
    violationCount: violations.length,
    tabWidthSetting: tabWidth,
    violations: violations
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(report, null, 2)
      }
    ]
  };
});

// Run the server using Standard Input/Output (stdio) transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Line Length Checker MCP Server (with Tab Support) running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
