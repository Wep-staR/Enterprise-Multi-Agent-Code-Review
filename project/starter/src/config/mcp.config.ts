import 'dotenv/config';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

/**
 * Model Context Protocol (MCP) server configurations
 *
 * Required MCP Servers:
 * 1. GitHub - For PR/repo operations
 * 2. ESLint - For code linting and style analysis
 *
 * Documentation:
 * - MCP Protocol: https://modelcontextprotocol.io
 * - GitHub MCP: https://github.com/github/github-mcp-server
 * - ESLint MCP: https://eslint.org/docs/latest/use/mcp
 */

export function getMcpServersConfig(
  githubToken: string | undefined = process.env.GITHUB_TOKEN
) {
  return {
    github: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken ?? ''
      }
    },
    eslint: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@eslint/mcp@latest'],
      env: {}
    }
  } satisfies Record<string, McpServerConfig>;
}

export const mcpServersConfig = getMcpServersConfig();

export const githubTools = [
  'mcp__github__get_pull_request',
  'mcp__github__get_pull_request_files',
  'mcp__github__get_file_contents'
] as const;

export const eslintTools = ['mcp__eslint__lint'] as const;

export const mcpAllowedTools = [
  ...githubTools,
  ...eslintTools
] as const;
