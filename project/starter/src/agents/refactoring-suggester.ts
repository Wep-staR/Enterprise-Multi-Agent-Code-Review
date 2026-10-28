import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

export const refactoringSuggester: AgentDefinition = {
  description:
    'Finds justified, low-risk refactoring opportunities in changed code and returns actionable before-and-after examples.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Skill'],
  model: 'inherit'
};
