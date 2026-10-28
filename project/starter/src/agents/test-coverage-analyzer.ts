import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Assesses tests related to changed code, identifies specific untested paths, and proposes focused tests with meaningful assertions.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  tools: ['Skill'],
  model: 'inherit'
};
