# [Project Name] - Development Guidelines

## Project Overview

<!-- What is this project? 1-2 paragraphs covering purpose and core philosophy. -->

[Brief description of what this project does and why it exists.]

**Core Philosophy**: [The guiding principle that should inform every implementation decision.]

## Primary Reference Documents

<!-- List the key documents Claude should consult. Adapt to your project. -->

**Specification:** `[path/to/spec.md]`
- Complete technical specification
- Read relevant section BEFORE implementing any feature

**Session Status:** `docs/SESSION_STATUS.md`
- **Current project state** and next session goals (lean, focused)
- **UPDATE THIS AT THE END OF EACH SESSION**

**Session History:** `docs/SESSION_HISTORY.md`
- **Detailed past session notes** (only load when needed to save context)
- Archive of completed work, decisions, and technical details

**CRITICAL**: This is SPEC-DRIVEN development - the specification comes first, implementation second.

## Session Workflow

### Starting a Session
1. Read `docs/SESSION_STATUS.md` to understand current state and next goals
2. Review "Next Session Tasks" section
3. Begin work on planned tasks
4. Reference `docs/SESSION_HISTORY.md` only if you need historical context

### During a Session
- Follow development principles below
- Reference specification for implementation details
- Write tests first (TDD)
- Document decisions in code comments

### Ending a Session
**MANDATORY: Update BOTH session files before closing**

**1. Update `docs/SESSION_HISTORY.md`** (detailed archive):
```markdown
## Session YYYY-MM-DD: [Phase/Task Description]

**Completed Tasks:**
- Detailed list of what was accomplished
- Files created/modified
- Test results

**Technical Decisions:**
- Decision 1 with rationale
- Decision 2 with rationale

**Issues Resolved:**
- Issue and solution

**Git Commit:** `hash` - "commit message"
```

**2. Update `docs/SESSION_STATUS.md`** (lean, current state):
- Update "Completed" checklist
- Update "Next Session Goals" with new tasks
- Keep it concise - detailed notes go in SESSION_HISTORY.md

**Commit and push both files** after updating.

## Architecture Principles

<!-- Replace these with your project's core architectural rules. 3-5 principles that should NEVER be violated. -->

### 1. [Principle Name]

**[Rule statement]:**
1. [Step or constraint]
2. [Step or constraint]
3. [Step or constraint]

<!-- Example: -->
<!-- ### 1. Separation of Concerns -->
<!-- Each module should have a single, well-defined responsibility and be independently testable. -->

### 2. [Principle Name]

[Description and constraints]

### 3. Directory Structure

<!-- Define the expected project layout. -->

```
src/
├── [module_1]/       # [responsibility]
├── [module_2]/       # [responsibility]
├── [module_3]/       # [responsibility]
└── utils/            # Helper functions, common utilities
```

Each module should:
- Have a single, well-defined responsibility
- Be independently testable
- Not mix concerns across module boundaries

## Development Standards

### Code Style

1. **Type Hints**: Use type hints for all function signatures
   ```python
   def function_name(param: str, count: int) -> bool:
       """Brief description."""
       pass
   ```

2. **Docstrings**: Required for all public functions
   - Include purpose, parameters, return value
   - Include example if logic is complex

3. **Error Handling**:
   - Validate external inputs (API responses, user input, file reads)
   - Handle missing data gracefully
   - Log errors with context
   - Never silently fail on bad data

4. **Configuration**:
   - Secrets in `.env` (never commit)
   - Tunable parameters in `config/` YAML files
   - Document why each configuration value is set

### Testing Requirements

**MANDATORY tests before considering any feature complete:**

1. **Unit Tests** for all business logic
2. **Integration Tests** for data pipelines and external integrations
3. **Edge Case Tests** for missing data, invalid inputs, boundary conditions

### Data Quality

<!-- Remove or adapt this section if your project doesn't handle external data. -->

1. **Always validate external data**:
   - Check for null/missing values
   - Verify data types match expectations
   - Log when data is unavailable

2. **Handle missing data explicitly**:
   - Document the strategy for each data source
   - NEVER use arbitrary defaults silently

3. **Store raw data**:
   - Keep original responses in `data/raw/`
   - Store processed values in `data/processed/`
   - Enables recalculation and debugging

## Implementation Phases

<!-- Define your project roadmap. Mark phases as you complete them. -->
<!-- RULE: Do not move to next phase until current phase is complete and tested. -->

### Phase 1: [Foundation]
- [ ] [Task 1]
- [ ] [Task 2]
- [ ] [Task 3]

### Phase 2: [Core Feature]
- [ ] [Task 1]
- [ ] [Task 2]

### Phase 3: [Enhancement]
- [ ] [Task 1]
- [ ] [Task 2]

### Phase 4+: [Testing & Production]
- [ ] [Task 1]
- [ ] [Task 2]

## Key Implementation Requirements

<!-- Document the most critical technical requirements. These are the things that are easy to get wrong and expensive to fix later. Include code examples of correct vs incorrect approaches. -->

### [Requirement 1]

```python
# CORRECT
correct_approach()

# WRONG
incorrect_approach()
```

### [Requirement 2]

[Description and constraints]

## Common Pitfalls to Avoid

### DON'T:
- [Anti-pattern 1]
- [Anti-pattern 2]
- [Anti-pattern 3]

### DO:
- [Best practice 1]
- [Best practice 2]
- [Best practice 3]

## External Integrations

<!-- List all APIs, databases, and external services. Include rate limits and error handling expectations. -->

### Required Services

1. **[Service Name]** ([library]):
   - What data it provides
   - Rate limits: [X calls/minute]

2. **[Service Name]**:
   - What data it provides
   - Rate limits: [X calls/minute]

### Integration Best Practices

1. **Rate Limiting**: Respect API rate limits; implement backoff/retry logic
2. **Error Handling**: Log failures with context; decide skip vs cache vs raise
3. **Data Validation**: Check for None/NaN; verify freshness; log anomalies

## Version Control Guidelines

### Commit Messages

Follow conventional commits:
```
feat: Add new feature description
fix: Handle edge case in module
docs: Update API integration guide
test: Add unit tests for calculator
refactor: Extract helper from large function
```

### What to Commit

Commit: source code, tests, documentation, config templates, requirements files

Never commit: API keys (.env), raw data files, personal logs, temporary files

## Questions and Decisions

When you encounter an ambiguous situation:

1. **Check the specification first** - is this addressed in the spec?
2. **Follow the principle of least surprise** - what's the simplest correct implementation?
3. **Document the decision** - add a code comment explaining why
4. **Ask before making major changes** - new dependencies, architecture changes, configuration changes

## Success Criteria

A feature is "done" when:

- [ ] Implementation matches specification
- [ ] Unit tests pass with good coverage
- [ ] Integration tests verify end-to-end flow
- [ ] Error handling is robust
- [ ] Code is committed and pushed

---

## Development Workflow

### During Development
1. Read relevant specification section
2. Design implementation approach
3. Write tests first (TDD)
4. Implement feature
5. Validate against spec
6. Document and commit

### End-of-Session Checklist

**MANDATORY before ending any work session:**

- [ ] **Update `docs/SESSION_HISTORY.md`** (FIRST - detailed archive)
  - Add new session entry with date and task description
  - List all completed tasks in detail
  - Document all files created/modified
  - Record technical decisions with rationale
  - Note issues resolved and solutions
  - Include git commit hash and message

- [ ] **Update `docs/SESSION_STATUS.md`** (SECOND - current state)
  - Update completed checklist
  - Update "Next Session Goals" with new tasks
  - Keep it lean - detailed notes go in SESSION_HISTORY.md

- [ ] **Commit all changes**
  - Stage all modified files (including BOTH session docs)
  - Write clear commit message

- [ ] **Push to remote**

---

*Last Updated: Review and update SESSION_STATUS.md at the end of EVERY session.*
