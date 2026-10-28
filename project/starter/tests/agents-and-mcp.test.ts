import { describe, expect, it } from 'vitest';
import {
  codeQualityAnalyzer,
  refactoringSuggester,
  testCoverageAnalyzer
} from '../src/agents/index.js';
import { getMcpServersConfig } from '../src/config/mcp.config.js';

describe('MCP configuration', () => {
  it('configures GitHub and ESLint over stdio with expected commands', () => {
    const config = getMcpServersConfig('test-token');
    expect(config.github).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'test-token' }
    });
    expect(config.eslint).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@eslint/mcp@latest'],
      env: {}
    });
  });
});

describe('specialist agents', () => {
  it('defines each specialist with inherited model and Skill support', () => {
    for (const agent of [
      codeQualityAnalyzer,
      testCoverageAnalyzer,
      refactoringSuggester
    ]) {
      expect(agent.description.length).toBeGreaterThan(20);
      expect(agent.model).toBe('inherit');
      expect(agent.tools).toContain('Skill');
      expect(agent.prompt.length).toBeGreaterThan(100);
    }

    expect(codeQualityAnalyzer.prompt).toContain('security');
    expect(testCoverageAnalyzer.prompt).toContain('assertion');
    expect(refactoringSuggester.prompt).toContain('before-and-after');
  });
});
