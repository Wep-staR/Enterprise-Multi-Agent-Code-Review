import { ReviewReport } from '../types/report-types';

/**
 * Report Generator
 * Converts ReviewReport to various output formats (Markdown, HTML, JSON)
 */
export class ReportGenerator {
  /**
   * Generate a Markdown report for PR comments
   */
  generateMarkdownReport(report: ReviewReport): string {
    const { summary, recommendations, fileReviews } = report;

    const formattedRecs = recommendations.slice(0, 5).map((rec, idx) => {
      const emoji = {
        critical: '🚨',
        high: '⚠️',
        medium: '📝',
        low: '💡'
      }[rec.priority];

      return `${idx + 1}. ${emoji} **${rec.category}**: ${rec.description}
   - Files: ${rec.files.join(', ')}`;
    }).join('\n\n');

    const formattedFiles = fileReviews.map(review => {
      const { file, codeQuality, testCoverage, refactorings } = review;

      const issueList = codeQuality.issues.slice(0, 3)
        .map(i => `  - Line ${i.line}: \`${i.severity}\` ${i.description}`)
        .join('\n');

      const testList = testCoverage.untestedPaths.slice(0, 2)
        .map(p => `  - \`${p.location}\` (${p.priority} priority)`)
        .join('\n');

      const refactorList = refactorings.suggestions.slice(0, 2)
        .map(s => `  - **${s.type}**: ${s.description}`)
        .join('\n');

      return `### 📄 \`${file}\`

**Quality Score:** ${codeQuality.overallScore}/100 | **Coverage:** ~${testCoverage.coverageEstimate}%

#### Issues (${codeQuality.issues.length})
${issueList || '  None found'}
${codeQuality.issues.length > 3 ? `\n  *...and ${codeQuality.issues.length - 3} more*` : ''}

#### Test Gaps (${testCoverage.untestedPaths.length})
${testList || '  None found'}
${testCoverage.untestedPaths.length > 2 ? `\n  *...and ${testCoverage.untestedPaths.length - 2} more*` : ''}

#### Refactoring Opportunities (${refactorings.suggestions.length})
${refactorList || '  None found'}
${refactorings.suggestions.length > 2 ? `\n  *...and ${refactorings.suggestions.length - 2} more*` : ''}`;
    }).join('\n\n---\n\n');

    return `# 🔍 Code Review Report

**Pull request:** [${report.pullRequest.owner}/${report.pullRequest.repo}#${report.pullRequest.number}](https://github.com/${encodeURIComponent(report.pullRequest.owner)}/${encodeURIComponent(report.pullRequest.repo)}/pull/${report.pullRequest.number})

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | ${summary.overallScore}/100 |
| **Files Reviewed** | ${summary.totalFiles} |
| **Critical Issues** | ${summary.criticalIssues} |
| **High Priority Tests** | ${summary.highPriorityTests} |
| **Refactoring Opportunities** | ${summary.refactoringOpportunities} |

## 🎯 Top Recommendations

${formattedRecs || 'No recommendations at this time.'}

## 📁 File Details

${formattedFiles}

---

*Generated at ${report.metadata.analyzedAt} • Duration: ${report.metadata.duration}ms*
`;
  }

  /**
   * Generate an HTML report for web display
   */
  generateHTMLReport(report: ReviewReport): string {
    const { summary, recommendations, metadata } = report;

    const recList = recommendations.slice(0, 5).map(r => `
      <li class="rec-${r.priority}">
        <span class="priority">[${escapeHtml(r.priority.toUpperCase())}]</span>
        <strong>${escapeHtml(r.category)}</strong>: ${escapeHtml(r.description)}
        <br><small>Files: ${r.files.map(escapeHtml).join(', ')}</small>
      </li>
    `).join('');
    const fileSections = report.fileReviews.map(review => {
      const issues = review.codeQuality.issues.map(issue => `
        <li class="issue-${escapeHtml(issue.severity)}">
          <strong>Line ${issue.line} · ${escapeHtml(issue.severity)} · ${escapeHtml(issue.category)}</strong>
          <p>${escapeHtml(issue.description)}</p>
          <p><strong>Suggested fix:</strong> ${escapeHtml(issue.suggestion)}</p>
        </li>
      `).join('');
      const testGaps = review.testCoverage.untestedPaths.map(path => `
        <li>
          <strong>${escapeHtml(path.location)} · ${escapeHtml(path.priority)} priority</strong>
          <p>${escapeHtml(path.reasoning)}</p>
          <p><strong>Suggested test:</strong> ${escapeHtml(path.suggestedTest)}</p>
        </li>
      `).join('');
      const refactorings = review.refactorings.suggestions.map(suggestion => `
        <li>
          <strong>${escapeHtml(suggestion.type)} · ${escapeHtml(suggestion.impact)} impact</strong>
          <p>${escapeHtml(suggestion.location)}: ${escapeHtml(suggestion.description)}</p>
          <div class="code-examples">
            <div><strong>Before</strong><pre><code>${escapeHtml(suggestion.before)}</code></pre></div>
            <div><strong>After</strong><pre><code>${escapeHtml(suggestion.after)}</code></pre></div>
          </div>
          <p><strong>Benefits:</strong> ${escapeHtml(suggestion.benefits)}</p>
        </li>
      `).join('');

      return `
        <section class="file-review">
          <h2>${escapeHtml(review.file)}</h2>
          <p class="file-summary">Quality: ${review.codeQuality.overallScore}/100 · Estimated coverage: ${review.testCoverage.coverageEstimate}%</p>
          <p>${escapeHtml(review.codeQuality.summary)}</p>
          <h3>Quality issues (${review.codeQuality.issues.length})</h3>
          <ul>${issues || '<li>None reported.</li>'}</ul>
          <h3>Test gaps (${review.testCoverage.untestedPaths.length})</h3>
          <p>${escapeHtml(review.testCoverage.summary)}</p>
          <ul>${testGaps || '<li>No specific gaps reported.</li>'}</ul>
          <h3>Refactoring opportunities (${review.refactorings.suggestions.length})</h3>
          <p>${escapeHtml(review.refactorings.summary)}</p>
          <ul>${refactorings || '<li>No refactoring suggestions reported.</li>'}</ul>
        </section>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review — ${escapeHtml(report.pullRequest.owner)}/${escapeHtml(report.pullRequest.repo)}#${report.pullRequest.number}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px;
      background: #f8f9fa;
      color: #212529;
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 12px; }
    .summary {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin: 24px 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .metric { text-align: center; }
    .metric-value { font-size: 2em; font-weight: bold; color: #3498db; }
    .metric-label { color: #6c757d; font-size: 0.9em; }
    ul { list-style: none; padding: 0; }
    li { padding: 12px; margin: 8px 0; border-radius: 4px; background: white; }
    .rec-critical { border-left: 4px solid #e74c3c; }
    .rec-high { border-left: 4px solid #f39c12; }
    .rec-medium { border-left: 4px solid #3498db; }
    .rec-low { border-left: 4px solid #27ae60; }
    .priority { font-weight: bold; margin-right: 8px; }
    .rec-critical .priority { color: #e74c3c; }
    .rec-high .priority { color: #f39c12; }
    .rec-medium .priority { color: #3498db; }
    .rec-low .priority { color: #27ae60; }
    .file-review { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .file-review h2 { overflow-wrap: anywhere; color: #2c3e50; }
    .file-review li { border: 1px solid #e9ecef; }
    .issue-critical, .issue-high { border-left: 4px solid #e74c3c !important; }
    .issue-medium { border-left: 4px solid #f39c12 !important; }
    .issue-low, .issue-info { border-left: 4px solid #3498db !important; }
    .file-summary { color: #6c757d; }
    .code-examples { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f3f5; padding: 12px; border-radius: 4px; }
    footer { text-align: center; color: #6c757d; margin-top: 32px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>🔍 Code Review Report: ${escapeHtml(report.pullRequest.owner)}/${escapeHtml(report.pullRequest.repo)}#${report.pullRequest.number}</h1>
  
  <div class="summary">
    <div class="metric">
      <div class="metric-value">${summary.overallScore}</div>
      <div class="metric-label">Overall Score</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.totalFiles}</div>
      <div class="metric-label">Files Reviewed</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.criticalIssues}</div>
      <div class="metric-label">Critical Issues</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.highPriorityTests}</div>
      <div class="metric-label">Tests Needed</div>
    </div>
    <div class="metric">
      <div class="metric-value">${summary.refactoringOpportunities}</div>
      <div class="metric-label">Refactorings</div>
    </div>
  </div>

  <h2>🎯 Top Recommendations</h2>
  <ul>${recList || '<li>No recommendations at this time.</li>'}</ul>

  <h2>📁 File Reviews</h2>
  ${fileSections || '<p>No file-level reviews were returned.</p>'}

  <footer>
    Generated at ${metadata.analyzedAt} • Duration: ${metadata.duration}ms
  </footer>
</body>
</html>`;
  }

  /**
   * Generate formatted JSON report
   */
  generateJSONReport(report: ReviewReport): string {
    return JSON.stringify(report, null, 2);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
