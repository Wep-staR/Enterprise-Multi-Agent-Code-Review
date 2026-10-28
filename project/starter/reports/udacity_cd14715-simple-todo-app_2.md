# 🔍 Code Review Report

**Pull request:** [udacity/cd14715-simple-todo-app#2](https://github.com/udacity/cd14715-simple-todo-app/pull/2)

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | 25/100 |
| **Files Reviewed** | 1 |
| **Critical Issues** | 3 |
| **High Priority Tests** | 5 |
| **Refactoring Opportunities** | 5 |

## 🎯 Top Recommendations

1. 🚨 **security**: Block merge immediately. All three new search functions (searchTodos, searchTodosByStatus, getTodosByUser) contain SQL injection vulnerabilities that allow arbitrary SQL execution. Refactor to use parameterized queries matching the existing secure pattern (e.g., getTodoById, createTodo).
   - Files: src/todo.ts

2. 🚨 **testing**: Add security-focused tests demonstrating SQL injection vulnerabilities before fixing them. Tests should verify that malicious inputs like "'; DROP TABLE todos; --" and "' OR '1'='1" cannot exploit the search functions. After fixing, tests should confirm parameterized queries prevent injection.
   - Files: src/todo.ts

3. ⚠️ **correctness**: Fix type mismatch in searchTodosByStatus: change parameter type from 'string' to 'boolean' to match the Todo interface and database schema. Current implementation risks runtime errors and incorrect results.
   - Files: src/todo.ts

4. ⚠️ **testing**: Add comprehensive functional tests for all three new search functions covering valid inputs, edge cases (empty strings, wildcards, special characters), and integration testing for the JOIN operation in getTodosByUser.
   - Files: src/todo.ts

5. 📝 **maintainability**: Add input validation to all new search functions consistent with existing patterns (e.g., createTodo validates inputs). Validate for null/undefined, empty strings, and appropriate data types before executing queries.
   - Files: src/todo.ts

## 📁 File Details

### 📄 `src/todo.ts`

**Quality Score:** 25/100 | **Coverage:** ~0%

#### Issues (9)
  - Line 121: `critical` SQL injection vulnerability: User input 'keyword' is directly interpolated into SQL query using template literals without parameterization. An attacker could inject malicious SQL like "'; DROP TABLE todos; --" to execute arbitrary SQL commands.
  - Line 132: `critical` SQL injection vulnerability: User input 'completed' is concatenated directly into SQL query without validation or parameterization. An attacker could inject "1; DELETE FROM todos; --" to execute destructive SQL commands.
  - Line 143: `critical` SQL injection vulnerability: User input 'userId' is directly embedded in SQL query using template literals without sanitization or parameterization. An attacker could exploit this with input like "1' OR '1'='1" to bypass access controls and view unauthorized data.

  *...and 6 more*

#### Test Gaps (12)
  - `searchTodos function (line 119)` (critical priority)
  - `searchTodosByStatus function (line 130)` (critical priority)

  *...and 10 more*

#### Refactoring Opportunities (5)
  - **pattern-improvement**: SQL injection vulnerability caused by string interpolation. The existing codebase consistently uses parameterized queries (see getTodoById, updateTodoStatus, deleteTodo). Align with established security pattern.
  - **pattern-improvement**: SQL injection vulnerability through string concatenation and incorrect type handling. Parameter should be boolean, not string. Violates parameterized query pattern used elsewhere in the file.

  *...and 3 more*

---

*Generated at 2026-10-28T12:50:27.713Z • Duration: 272493ms*
