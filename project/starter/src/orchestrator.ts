import {
  query,
  type AgentDefinition,
  type Options,
  type SDKMessage
} from '@anthropic-ai/claude-agent-sdk';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeQualityAnalyzer, refactoringSuggester, testCoverageAnalyzer } from './agents/index.js';
import { getMcpServersConfig, mcpAllowedTools } from './config/mcp.config.js';
import {
  ReviewReportJSONSchema,
  ReviewReportSchema,
  type ReviewReport
} from './types/index.js';
import { ErrorCodes, ReviewError, withRetry, withTimeout } from './utils/error-handler.js';
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  withRateLimit,
  type RateLimiterConfig
} from './utils/rate-limiter.js';
import { buildOrchestratorPrompt } from './prompts/orchestrator.prompt.js';

const DEFAULT_PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

type QueryMessage =
  | Exclude<SDKMessage, { type: 'result' }>
  | {
      type: 'result';
      subtype: string;
      structured_output?: unknown;
      result?: string;
    };
type QueryFunction = (params: { prompt: string; options?: Options }) => AsyncIterable<QueryMessage>;

export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
  projectRoot?: string;
  rateLimits?: Partial<RateLimiterConfig>;
  queryFn?: QueryFunction;
}

/**
 * Coordinates GitHub MCP access and the three specialized code-review agents.
 */
export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly maxTurns: number;
  private readonly timeoutMs: number;
  private readonly projectRoot: string;
  private readonly estimatedTokens: number;
  private readonly rateLimiter: RateLimiter;
  private readonly queryFn: QueryFunction;

  constructor(options: OrchestratorOptions = {}) {
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTurns = options.maxTurns ?? 18;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.projectRoot = options.projectRoot ?? DEFAULT_PROJECT_ROOT;
    this.estimatedTokens = Math.min(
      12_000,
      options.rateLimits?.maxTokensPerMinute ?? DEFAULT_RATE_LIMITS.maxTokensPerMinute
    );
    this.rateLimiter = new RateLimiter(options.rateLimits);
    this.queryFn = options.queryFn ?? query;
  }

  /**
   * Review a pull request and validate the aggregate report before returning it.
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    if (!owner.trim() || !repo.trim() || !Number.isInteger(prNumber) || prNumber <= 0) {
      throw new ReviewError(
        'A repository owner, repository name, and positive integer PR number are required.',
        ErrorCodes.INVALID_CONFIG
      );
    }

    const startedAt = Date.now();
    const agents: Record<string, AgentDefinition> = {
      'code-quality-analyzer': codeQualityAnalyzer,
      'test-coverage-analyzer': testCoverageAnalyzer,
      'refactoring-suggester': refactoringSuggester
    };
    const useBedrock = Boolean(
      !process.env.ANTHROPIC_API_KEY &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env
    };
    if (useBedrock) {
      environment.CLAUDE_CODE_USE_BEDROCK = '1';
    } else {
      delete environment.CLAUDE_CODE_USE_BEDROCK;
    }
    const options: Options = {
      cwd: this.projectRoot,
      settingSources: ['project'],
      model: this.model,
      maxTurns: this.maxTurns,
      tools: ['Task', 'Read', 'Grep', 'Glob', 'Skill'],
      allowedTools: ['Task', 'Read', 'Grep', 'Glob', 'Skill', ...mcpAllowedTools],
      permissionMode: 'dontAsk',
      agents,
      mcpServers: getMcpServersConfig(),
      outputFormat: {
        type: 'json_schema',
        schema: ReviewReportJSONSchema
      },
      env: environment
    };

    const generateReport = async (queryOptions: Options): Promise<ReviewReport> => {
      const structuredOutput = await this.collectStructuredOutput(
        buildOrchestratorPrompt(owner, repo, prNumber),
        queryOptions
      );
      const parsed = ReviewReportSchema.safeParse(structuredOutput);
      if (!parsed.success) {
        throw new ReviewError(
          `The orchestrator returned an invalid review report: ${parsed.error.message}`,
          ErrorCodes.VALIDATION_FAILED
        );
      }

      const report = parsed.data;
      if (
        report.pullRequest.owner !== owner ||
        report.pullRequest.repo !== repo ||
        report.pullRequest.number !== prNumber
      ) {
        throw new ReviewError(
          'The generated report identifies a different pull request than the requested target.',
          ErrorCodes.VALIDATION_FAILED
        );
      }

      for (const fileReview of report.fileReviews) {
        if (
          fileReview.file !== fileReview.codeQuality.file ||
          fileReview.file !== fileReview.testCoverage.file ||
          fileReview.file !== fileReview.refactorings.file
        ) {
          throw new ReviewError(
            `Agent results refer to inconsistent files for ${fileReview.file}.`,
            ErrorCodes.VALIDATION_FAILED
          );
        }
      }

      const allIssues = report.fileReviews.flatMap(review => review.codeQuality.issues);
      const allUntestedPaths = report.fileReviews.flatMap(
        review => review.testCoverage.untestedPaths
      );
      const scores = report.fileReviews.map(review => review.codeQuality.overallScore);
      const score =
        scores.length === 0
          ? 100
          : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);

      return {
        ...report,
        summary: {
          totalFiles: report.fileReviews.length,
          overallScore: Math.max(0, Math.min(100, score)),
          criticalIssues: allIssues.filter(issue => issue.severity === 'critical').length,
          highPriorityTests: allUntestedPaths.filter(path => path.priority === 'high').length,
          refactoringOpportunities: report.fileReviews.reduce(
            (sum, review) => sum + review.refactorings.suggestions.length,
            0
          )
        },
        metadata: {
          ...report.metadata,
          analyzedAt: new Date().toISOString(),
          duration: Date.now() - startedAt,
          agentVersions: {
            'code-quality-analyzer': this.model,
            'test-coverage-analyzer': this.model,
            'refactoring-suggester': this.model
          }
        }
      };
    };

    return withRateLimit(
      this.rateLimiter,
      () =>
        withRetry(
          async () => {
            const abortController = new AbortController();
            try {
              return await withTimeout(
                () => generateReport({ ...options, abortController }),
                this.timeoutMs,
                `Pull request review exceeded the ${this.timeoutMs}ms timeout.`
              );
            } catch (error) {
              abortController.abort();
              throw error;
            }
          },
          1,
          1000,
          isTransientError
        ),
      this.estimatedTokens
    );
  }

  private async collectStructuredOutput(
    prompt: string,
    options: Options
  ): Promise<unknown> {
    let resultMessage: Extract<QueryMessage, { type: 'result' }> | undefined;

    for await (const message of this.queryFn({ prompt, options })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            console.info(`Agent tool: ${block.name}`);
          }
        }
      }
      if (message.type === 'result') {
        resultMessage = message;
      }
    }

    if (!resultMessage) {
      throw new ReviewError(
        'The Claude Agent SDK completed without returning a result.',
        ErrorCodes.AGENT_FAILED
      );
    }

    if (resultMessage.subtype !== 'success') {
      const failureDetail =
        resultMessage.result ?? resultMessage.subtype;
      throw new ReviewError(
        `Pull request analysis failed (${resultMessage.subtype}): ${failureDetail}`,
        ErrorCodes.AGENT_FAILED,
        { subtype: resultMessage.subtype }
      );
    }

    if (resultMessage.structured_output === undefined) {
      throw new ReviewError(
        'The orchestrator did not return the required structured review report.',
        ErrorCodes.STRUCTURED_OUTPUT_FAILED
      );
    }

    return resultMessage.structured_output;
  }
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof ReviewError && error.code === ErrorCodes.AGENT_TIMEOUT) {
    return false;
  }
  return /rate.?limit|timeout|temporar|network|connection|econn|eai_again|server.?error/i.test(
    error.message
  );
}
