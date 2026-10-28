import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Reviews changed code for security vulnerabilities, bugs, performance risks, and maintainability concerns; invoke for evidence-based file-level quality findings.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  tools: ['Skill'],
  model: 'inherit'
};
