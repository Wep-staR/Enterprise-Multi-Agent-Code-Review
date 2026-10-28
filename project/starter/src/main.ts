import * as dotenv from 'dotenv';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { formatError } from './utils/error-handler.js';
import { logger } from './utils/logger.js';
import { ReportGenerator } from './utils/report-generator.js';

dotenv.config();

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function runCli(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const [owner, repo, prText, ...extraArgs] = args;
  if (!owner || !repo || !prText || extraArgs.length > 0) {
    throw new Error('Usage: npm run dev -- <owner> <repo> <positive-pr-number>');
  }

  const prNumber = Number(prText);
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    throw new Error('The pull request number must be a positive integer.');
  }

  const usesAnthropicApi = Boolean(environment.ANTHROPIC_API_KEY);
  const hasAwsAccessKey = Boolean(environment.AWS_ACCESS_KEY_ID);
  const hasAwsSecretKey = Boolean(environment.AWS_SECRET_ACCESS_KEY);
  const usesBedrock = !usesAnthropicApi && hasAwsAccessKey && hasAwsSecretKey;

  if (!usesAnthropicApi && !usesBedrock) {
    throw new Error(
      'Authentication is not configured. Set ANTHROPIC_API_KEY, or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for Bedrock.'
    );
  }
  if (usesBedrock && !environment.AWS_REGION) {
    throw new Error('AWS_REGION is required when using AWS Bedrock authentication.');
  }
  if (!environment.ANTHROPIC_MODEL?.trim()) {
    throw new Error(
      'ANTHROPIC_MODEL is required. Use a Claude model ID such as claude-sonnet-4-5-20250929 (Anthropic API) or us.anthropic.claude-sonnet-4-5-20250929-v1:0 (Bedrock).'
    );
  }

  if (usesBedrock) {
    console.log('Using AWS Bedrock authentication.');
  } else {
    console.log('Using Anthropic API authentication.');
  }
  if (!environment.GITHUB_TOKEN) {
    console.warn(
      'GITHUB_TOKEN is not set. Public PR access may be unauthenticated and subject to stricter GitHub rate limits.'
    );
  }

  const projectRoot = environment.PROJECT_ROOT
    ? resolve(environment.PROJECT_ROOT)
    : PROJECT_ROOT;
  try {
    await access(projectRoot);
    await access(resolve(projectRoot, '.claude', 'skills'));
  } catch (error) {
    throw new Error(
      `PROJECT_ROOT must be a readable project directory containing .claude\\skills: ${projectRoot} (${formatError(error)})`
    );
  }

  const orchestrator = new CodeReviewOrchestrator({
    model: environment.ANTHROPIC_MODEL.trim(),
    projectRoot
  });
  const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

  const reportDirectory = resolve(PROJECT_ROOT, 'reports');
  await mkdir(reportDirectory, { recursive: true });

  const baseName = [
    safeFilenameSegment(owner),
    safeFilenameSegment(repo),
    String(prNumber)
  ].join('_');
  const generator = new ReportGenerator();
  const reports = [
    {
      extension: 'json',
      content: generator.generateJSONReport(report)
    },
    {
      extension: 'md',
      content: generator.generateMarkdownReport(report)
    },
    {
      extension: 'html',
      content: generator.generateHTMLReport(report)
    }
  ];

  await Promise.all(
    reports.map(({ extension, content }) =>
      writeFile(resolve(reportDirectory, `${baseName}.${extension}`), content, 'utf8')
    )
  );
  for (const { extension } of reports) {
    console.log(`Saved ${resolve(reportDirectory, `${baseName}.${extension}`)}`);
  }
}

function safeFilenameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function main(): Promise<void> {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    const message = formatError(error);
    logger.error('Code review failed', { error: message });
    console.error(`Code review failed: ${message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main();
}
