import { describe, expect, it } from 'vitest';
import { ReportGenerator } from '../src/utils/report-generator.js';
import type { ReviewReport } from '../src/types/report-types.js';

const report: ReviewReport = {
  pullRequest: { owner: 'udacity', repo: 'sample', number: 1 },
  fileReviews: [{
    file: 'src/<script>.ts',
    codeQuality: {
      file: 'src/<script>.ts',
      issues: [{
        line: 4,
        severity: 'high',
        category: 'security',
        description: 'Untrusted <input> is unsafe.',
        suggestion: 'Escape user data.'
      }],
      overallScore: 72,
      summary: 'One issue.'
    },
    testCoverage: {
      file: 'src/<script>.ts',
      hasTests: false,
      testFiles: [],
      untestedPaths: [{
        type: 'edge-case',
        location: 'parseInput',
        priority: 'high',
        reasoning: 'Malformed input is not tested.',
        suggestedTest: 'Pass malformed input and assert a validation error.'
      }],
      coverageEstimate: 30,
      summary: 'Important cases are untested.'
    },
    refactorings: {
      file: 'src/<script>.ts',
      suggestions: [{
        type: 'simplify',
        location: 'parseInput',
        impact: 'low',
        description: 'Use a guard clause.',
        before: 'if (x) { return x }',
        after: 'if (!x) return; return x',
        benefits: 'Reduces nesting.'
      }],
      summary: 'One opportunity.'
    }
  }],
  summary: {
    totalFiles: 1,
    overallScore: 72,
    criticalIssues: 0,
    highPriorityTests: 1,
    refactoringOpportunities: 1
  },
  recommendations: [{
    priority: 'high',
    category: 'security',
    description: 'Escape untrusted input.',
    files: ['src/<script>.ts']
  }],
  metadata: {
    analyzedAt: '2026-10-28T00:00:00.000Z',
    duration: 10,
    agentVersions: { reviewer: 'test-model' }
  }
};

describe('ReportGenerator', () => {
  const generator = new ReportGenerator();

  it('renders file findings, test gaps, and actionable refactorings in HTML', () => {
    const html = generator.generateHTMLReport(report);
    expect(html).toContain('parseInput');
    expect(html).toContain('Malformed input is not tested.');
    expect(html).toContain('if (!x) return; return x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>.ts');
  });

  it('emits parseable JSON and readable Markdown', () => {
    expect(JSON.parse(generator.generateJSONReport(report))).toEqual(report);
    expect(generator.generateMarkdownReport(report)).toContain('udacity/sample#1');
    expect(generator.generateMarkdownReport(report)).toContain('Test Gaps (1)');
  });
});
