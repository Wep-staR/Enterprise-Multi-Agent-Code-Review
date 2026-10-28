import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';

describe('CLI validation', () => {
  it('requires all CLI arguments and a positive safe PR number', async () => {
    await expect(runCli([], {})).rejects.toThrow('Usage:');
    await expect(runCli(['owner', 'repo', '0'], {})).rejects.toThrow(
      'positive integer'
    );
    await expect(runCli(['owner', 'repo', '1', 'extra'], {})).rejects.toThrow(
      'Usage:'
    );
  });

  it('requires supported API or Bedrock authentication', async () => {
    await expect(runCli(['owner', 'repo', '1'], {})).rejects.toThrow(
      'Authentication is not configured'
    );
    await expect(runCli(['owner', 'repo', '1'], {
      AWS_ACCESS_KEY_ID: 'configured',
      AWS_SECRET_ACCESS_KEY: 'configured'
    })).rejects.toThrow('AWS_REGION is required');
  });

  it('requires a model for the selected authentication method', async () => {
    await expect(runCli(['owner', 'repo', '1'], {
      ANTHROPIC_API_KEY: 'configured'
    })).rejects.toThrow('ANTHROPIC_MODEL is required');
  });

  it('validates the skills project root before starting a review', async () => {
    await expect(runCli(['owner', 'repo', '1'], {
      ANTHROPIC_API_KEY: 'configured',
      ANTHROPIC_MODEL: 'test-model',
      PROJECT_ROOT: 'C:\\path\\that\\does-not-exist'
    })).rejects.toThrow('containing .claude\\skills');
  });
});
