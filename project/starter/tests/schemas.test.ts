import { describe, expect, it } from 'vitest';
import {
  CodeQualityResultJSONSchema,
  CodeQualityResultSchema,
  RefactoringSuggestionJSONSchema,
  RefactoringSuggestionSchema,
  ReviewReportJSONSchema,
  ReviewReportSchema,
  TestCoverageResultJSONSchema,
  TestCoverageResultSchema
} from '../src/types/index.js';

const codeQuality = {
  file: 'src/todo.ts',
  issues: [],
  overallScore: 100,
  summary: 'No significant quality issues found.'
};

const testCoverage = {
  file: 'src/todo.ts',
  hasTests: true,
  testFiles: ['tests/todo.test.ts'],
  untestedPaths: [],
  coverageEstimate: 100,
  summary: 'Relevant tests cover the changed behavior.'
};

const refactorings = {
  file: 'src/todo.ts',
  suggestions: [],
  summary: 'No refactoring is currently needed.'
};

const validReport = {
  pullRequest: { owner: 'udacity', repo: 'sample', number: 1 },
  fileReviews: [{
    file: 'src/todo.ts',
    codeQuality,
    testCoverage,
    refactorings
  }],
  summary: {
    totalFiles: 1,
    overallScore: 100,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0
  },
  recommendations: [],
  metadata: {
    analyzedAt: '2026-10-28T00:00:00.000Z',
    duration: 10,
    agentVersions: {
      'code-quality-analyzer': 'claude-sonnet-4-5-20250929',
      'test-coverage-analyzer': 'claude-sonnet-4-5-20250929',
      'refactoring-suggester': 'claude-sonnet-4-5-20250929'
    }
  }
};

describe('analysis schemas', () => {
  it('accepts valid code quality, test coverage, and refactoring results', () => {
    expect(CodeQualityResultSchema.parse(codeQuality)).toEqual(codeQuality);
    expect(TestCoverageResultSchema.parse(testCoverage)).toEqual(testCoverage);
    expect(RefactoringSuggestionSchema.parse(refactorings)).toEqual(refactorings);
  });

  it('rejects invalid types, enum values, and score boundaries', () => {
    expect(() => CodeQualityResultSchema.parse({ ...codeQuality, overallScore: 101 })).toThrow();
    expect(() => CodeQualityResultSchema.parse({
      ...codeQuality,
      issues: [{
        line: 4,
        severity: 'urgent',
        category: 'security',
        description: 'Bad input',
        suggestion: 'Validate it'
      }]
    })).toThrow();
    expect(() => TestCoverageResultSchema.parse({
      ...testCoverage,
      hasTests: 'yes'
    })).toThrow();
    expect(() => RefactoringSuggestionSchema.parse({
      ...refactorings,
      suggestions: [{
        type: 'rewrite-everything',
        location: 'handler',
        impact: 'high',
        description: 'Simplify',
        before: 'old()',
        after: 'new()',
        benefits: 'Clearer'
      }]
    })).toThrow();
  });

  it('accepts empty result arrays and score boundary values', () => {
    expect(CodeQualityResultSchema.parse({ ...codeQuality, overallScore: 0 }).issues).toEqual([]);
    expect(TestCoverageResultSchema.parse({
      ...testCoverage,
      hasTests: false,
      testFiles: [],
      untestedPaths: [],
      coverageEstimate: 0
    }).coverageEstimate).toBe(0);
    expect(RefactoringSuggestionSchema.parse(refactorings).suggestions).toEqual([]);
  });
});

describe('review report schema', () => {
  it('accepts a complete report and rejects invalid pull request and summary data', () => {
    expect(ReviewReportSchema.parse(validReport)).toEqual(validReport);
    expect(() => ReviewReportSchema.parse({
      ...validReport,
      pullRequest: { ...validReport.pullRequest, number: 0 }
    })).toThrow();
    expect(() => ReviewReportSchema.parse({
      ...validReport,
      summary: { ...validReport.summary, overallScore: 101 }
    })).toThrow();
  });

  it('converts result schemas to JSON Schema with required fields', () => {
    for (const jsonSchema of [
      CodeQualityResultJSONSchema,
      TestCoverageResultJSONSchema,
      RefactoringSuggestionJSONSchema,
      ReviewReportJSONSchema
    ]) {
      expect(jsonSchema).toHaveProperty('type', 'object');
      expect(jsonSchema).toHaveProperty('required');
    }

    expect(ReviewReportJSONSchema.required).toContain('pullRequest');
  });
});
