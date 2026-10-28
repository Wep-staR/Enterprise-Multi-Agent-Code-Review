import { describe, expect, it, vi } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator.js';
import type { ReviewReport } from '../src/types/report-types.js';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

const report: ReviewReport = {
  pullRequest: { owner: 'octocat', repo: 'Hello-World', number: 1 },
  fileReviews: [{
    file: 'src/app.ts',
    codeQuality: {
      file: 'src/app.ts',
      issues: [{
        line: 12,
        severity: 'critical',
        category: 'security',
        description: 'Untrusted input reaches a command.',
        suggestion: 'Validate the value before use.'
      }],
      overallScore: 60,
      summary: 'A critical security concern needs review.'
    },
    testCoverage: {
      file: 'src/app.ts',
      hasTests: false,
      testFiles: [],
      untestedPaths: [{
        type: 'function',
        location: 'runCommand',
        priority: 'high',
        reasoning: 'No test covers the changed command handling.',
        suggestedTest: 'Verify invalid input is rejected.'
      }],
      coverageEstimate: 20,
      summary: 'The changed path lacks tests.'
    },
    refactorings: {
      file: 'src/app.ts',
      suggestions: [{
        type: 'extract-function',
        location: 'runCommand',
        impact: 'medium',
        description: 'Extract input validation.',
        before: 'run(x)',
        after: 'validate(x); run(x)',
        benefits: 'Makes validation reusable.'
      }],
      summary: 'One actionable refactoring.'
    }
  }],
  summary: {
    totalFiles: 99,
    overallScore: 99,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0
  },
  recommendations: [],
  metadata: {
    analyzedAt: '2026-10-28T00:00:00.000Z',
    duration: 0,
    agentVersions: {}
  }
};

function createQuery(output: unknown) {
  const queryFn = vi.fn(async function* (_params: { prompt: string; options?: Options }) {
    yield { type: 'result' as const, subtype: 'success', structured_output: output };
  });
  return queryFn;
}

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('initializes with defaults and accepts custom limits', () => {
      expect(() => new CodeReviewOrchestrator()).not.toThrow();
      expect(() => new CodeReviewOrchestrator({
        rateLimits: {
          maxRequestsPerMinute: 4,
          maxTokensPerMinute: 8000,
          maxConcurrent: 2
        },
        model: 'test-model'
      })).not.toThrow();
    });
  });

  describe('reviewPullRequest', () => {
    it('invokes configured agents and validates/normalizes the final report', async () => {
      const queryFn = createQuery(report);
      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        queryFn
      });

      const result = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      expect(result.pullRequest).toEqual(report.pullRequest);
      expect(result.summary).toEqual({
        totalFiles: 1,
        overallScore: 60,
        criticalIssues: 1,
        highPriorityTests: 1,
        refactoringOpportunities: 1
      });
      expect(result.metadata.agentVersions).toEqual({
        'code-quality-analyzer': 'test-model',
        'test-coverage-analyzer': 'test-model',
        'refactoring-suggester': 'test-model'
      });

      const queryOptions = queryFn.mock.calls[0]?.[0].options;
      expect(queryOptions?.agents).toHaveProperty('code-quality-analyzer');
      expect(queryOptions?.agents).toHaveProperty('test-coverage-analyzer');
      expect(queryOptions?.agents).toHaveProperty('refactoring-suggester');
      expect(queryOptions?.allowedTools).toContain('Task');
      expect(queryOptions?.mcpServers).toHaveProperty('github');
      expect(queryOptions?.mcpServers).toHaveProperty('eslint');
    });

    it('rejects invalid PR arguments before contacting the SDK', async () => {
      const queryFn = createQuery(report);
      const orchestrator = new CodeReviewOrchestrator({ queryFn });
      await expect(orchestrator.reviewPullRequest('', 'Hello-World', 1)).rejects.toThrow(
        'owner, repository name, and positive integer PR number'
      );
      await expect(orchestrator.reviewPullRequest('octocat', 'Hello-World', 0)).rejects.toThrow(
        'owner, repository name, and positive integer PR number'
      );
      expect(queryFn).not.toHaveBeenCalled();
    });

    it('rejects schema-invalid results and reports for a different PR', async () => {
      const invalid = createQuery({ ...report, summary: { ...report.summary, overallScore: 200 } });
      await expect(new CodeReviewOrchestrator({ queryFn: invalid })
        .reviewPullRequest('octocat', 'Hello-World', 1)).rejects.toThrow(
        'invalid review report'
      );

      const wrongTarget = createQuery({
        ...report,
        pullRequest: { owner: 'someone-else', repo: 'Hello-World', number: 1 }
      });
      await expect(new CodeReviewOrchestrator({ queryFn: wrongTarget })
        .reviewPullRequest('octocat', 'Hello-World', 1)).rejects.toThrow(
        'different pull request'
      );
    });

    it('surfaces SDK failures rather than returning an empty report', async () => {
      const queryFn = vi.fn(async function* () {
        yield {
          type: 'result' as const,
          subtype: 'error_during_execution',
          result: 'agent declined to continue'
        };
      });

      await expect(new CodeReviewOrchestrator({ queryFn })
        .reviewPullRequest('octocat', 'Hello-World', 1)).rejects.toThrow(
        'agent declined to continue'
      );
    });

    it('aborts an SDK query when its timeout expires', async () => {
      let signal: AbortSignal | undefined;
      const queryFn = vi.fn((params: { prompt: string; options?: Options }) => {
        signal = params.options?.abortController?.signal;
        return (async function* () {
          await new Promise<never>((_, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true
            });
          });
        })();
      });

      await expect(new CodeReviewOrchestrator({
        queryFn,
        timeoutMs: 5
      }).reviewPullRequest('octocat', 'Hello-World', 1)).rejects.toMatchObject({
        code: 'AGENT_TIMEOUT'
      });
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
    });
  });
});
