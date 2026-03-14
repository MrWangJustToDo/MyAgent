import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import type { Sandbox } from "../../environment";

export const createFetchUrlTool = ({ sandbox }: { sandbox: Sandbox }) => {
  const tool = toolDefinition({
    name: "fetch-url-tool",
    description:
      "Fetches content from a URL using curl. Supports HTTP/HTTPS requests and can return text or save to file. Useful for downloading files, fetching API responses, or getting web page content.",
    inputSchema: z.object({
      url: z.string().describe("The URL to fetch content from."),
      method: z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
        .optional()
        .describe("HTTP method to use. Defaults to GET."),
      headers: z.record(z.string(), z.string()).optional().describe("HTTP headers to include in the request."),
      body: z.string().optional().describe("Request body for POST/PUT/PATCH requests."),
      outputPath: z
        .string()
        .optional()
        .describe("If provided, save the response to this file path instead of returning content."),
      timeout: z.number().int().min(1).max(300).optional().describe("Request timeout in seconds. Defaults to 30."),
      followRedirects: z.boolean().optional().describe("Whether to follow HTTP redirects. Defaults to true."),
    }),
    outputSchema: z.object({
      url: z.string().describe("The URL that was fetched."),
      method: z.string().describe("The HTTP method used."),
      statusCode: z.number().describe("HTTP status code."),
      content: z.string().optional().describe("Response content (if not saved to file)."),
      contentLength: z.number().optional().describe("Content length."),
      savedTo: z.string().optional().describe("Path where content was saved (if outputPath provided)."),
      message: z.string().describe("A message describing the result."),
    }),
  });

  tool.server(async ({ url, method, headers, body, outputPath, timeout, followRedirects }) => {
    // Build curl command
    let curlCommand = `curl -s -S --max-time ${timeout ?? 30}`;

    // Method
    if (method && method !== "GET") {
      curlCommand += ` -X ${method}`;
    }

    // Follow redirects
    if (followRedirects !== false) {
      curlCommand += " -L";
    }

    // Headers
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        curlCommand += ` -H "${key}: ${String(value).replace(/"/g, '\\"')}"`;
      }
    }

    // Body
    if (body) {
      curlCommand += ` -d '${body.replace(/'/g, "'\\''")}'`;
    }

    // Output to file or stdout
    if (outputPath) {
      curlCommand += ` -o "${outputPath}"`;
    }

    // Include response headers in output for status code
    curlCommand += " -w '\\n__HTTP_STATUS__:%{http_code}'";

    // Add URL
    curlCommand += ` "${url}"`;

    const result = await sandbox.runCommand(curlCommand);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to fetch URL: ${result.stderr || "Unknown error"}`);
    }

    // Parse output to extract status code
    const outputLines = result.stdout.split("\n");
    const statusLine = outputLines.find((line) => line.startsWith("__HTTP_STATUS__:"));
    const statusCode = statusLine ? parseInt(statusLine.split(":")[1], 10) : 0;
    const content = outputLines.filter((line) => !line.startsWith("__HTTP_STATUS__:")).join("\n");

    if (outputPath) {
      return {
        url,
        method: method ?? "GET",
        statusCode,
        savedTo: outputPath,
        message: `Successfully fetched and saved to: ${outputPath}`,
      };
    }

    return {
      url,
      method: method ?? "GET",
      statusCode,
      content,
      contentLength: content.length,
      message: `Successfully fetched URL with status ${statusCode}`,
    };
  });

  return tool;
};
