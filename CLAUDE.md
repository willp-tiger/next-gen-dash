# Prompt-Guided Dashboard Personalization - Development Guidelines

## Project Overview

A demo application that lets users describe what "queue health" means to them in natural language, then uses Claude AI to interpret their priorities into a personalized dashboard with metrics, thresholds, and visualizations. Built with Vite + React frontend, Express backend, and deployed on Railway.

**Core Philosophy**: Configuration through conversation, not menus. The user's natural language input drives everything -- metric selection, thresholds, chart types, and layout.

## Primary Reference Documents

**Specification:** `prompt-guided-dashboard-proposal.docx`
- Original concept proposal covering intent capture, interpretation, and adaptive refinement
- Read relevant section BEFORE implementing any feature

**Session Status:** `docs/SESSION_STATUS.md`
- **Current project state** and next session goals (lean, focused)
- **UPDATE THIS AT THE END OF EACH SESSION**

**Session History:** `docs/SESSION_HISTORY.md`
- **Detailed past session notes** (only load when needed to save context)
- Archive of completed work, decisions, and technical details

**CRITICAL**: This is SPEC-DRIVEN development - the proposal specification comes first, implementation second.

## Session Workflow

### Starting a Session
1. Read `docs/SESSION_STATUS.md` to understand current state and next goals
2. Review "Next Session Tasks" section
3. Begin work on planned tasks
4. Reference `docs/SESSION_HISTORY.md` only if you need historical context

### During a Session
- Follow development principles below
- Reference specification for implementation details
- Write tests for critical business logic
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

### 1. Separation of Concerns

**Client, server, and shared types are strictly separated:**
1. `client/` - React UI only. No business logic, no direct API calls outside `api/client.ts`
2. `server/` - Express API only. Handles Claude integration, mock data, config storage
3. `shared/` - TypeScript types imported by both client and server. No runtime code.

### 2. Config-Driven Dashboards

**Dashboards are rendered from a DashboardConfig object, never hardcoded:**
1. Claude generates a DashboardConfig from natural language input
2. The frontend renders whatever config it receives -- metrics, thresholds, chart types, layout
3. The canonical (standard) view is just another DashboardConfig with fixed values
4. Users edit configs through the interpretation review UI, not dashboard code

### 3. API-First Design

**All data flows through REST endpoints:**
1. Frontend never generates mock data or calls Claude directly
2. Backend is the single source of truth for configs, metrics, and suggestions
3. All endpoints return typed JSON matching shared interfaces

### 4. Directory Structure

```
next-gen-dash/
├── client/                   # Vite + React + Tailwind
│   └── src/
│       ├── api/              # Fetch wrapper for backend calls
│       ├── components/
│       │   ├── onboarding/   # Chat-style conversational flow
│       │   ├── interpretation/ # Review + edit Claude's interpretation
│       │   ├── dashboard/    # Metric tiles, charts, health badges
│       │   └── refinement/   # Interaction tracking + suggestion toasts
│       ├── hooks/            # Data fetching + state management
│       └── types/            # Re-exports from shared
├── server/                   # Express.js API
│   └── src/
│       ├── routes/           # REST endpoints
│       ├── services/         # Business logic (Claude, mock data, config store)
│       └── prompts/          # System prompts for Claude interpretation
├── shared/                   # TypeScript interfaces only
│   └── types.ts
├── docs/                     # Session tracking
├── Dockerfile                # Multi-stage production build
└── package.json              # npm workspaces root
```

Each module should:
- Have a single, well-defined responsibility
- Not mix concerns across module boundaries

## Development Standards

### Code Style

1. **TypeScript**: Strict mode enabled. All function parameters and return types must be typed.
   ```typescript
   function evaluateThreshold(value: number, thresholds: ThresholdConfig): HealthStatus {
     if (value <= thresholds.green.max) return 'healthy';
     if (value <= thresholds.yellow.max) return 'warning';
     return 'critical';
   }
   ```

2. **Error Handling**:
   - Validate Claude API responses (JSON parsing, schema validation)
   - Handle network errors in API client with user-friendly messages
   - Never silently fail on bad data from external sources

3. **Configuration**:
   - Secrets in `.env` (never commit) -- specifically `ANTHROPIC_API_KEY`
   - Port via `process.env.PORT` (Railway sets this)
   - Mock data baselines in `server/src/services/mockData.ts`

### Testing Requirements

**For this demo, focus testing on:**
1. Mock data generation produces valid values within expected ranges
2. Claude response parsing handles malformed JSON gracefully
3. Threshold evaluation logic (green/yellow/red) is correct

## Implementation Phases

### Phase 1: Foundation
- [x] Generate CLAUDE.md and session docs
- [ ] Scaffold npm workspaces (root, client, server, shared)
- [ ] Install dependencies and configure build tools
- [ ] Define shared TypeScript types

### Phase 2: Backend Core
- [ ] Mock data service with 12 queue health metrics
- [ ] In-memory config store
- [ ] Express routes: metrics, dashboard CRUD
- [ ] Claude integration: interpretation prompt + /api/interpret endpoint
- [ ] Refinement endpoints: interaction logging + suggestion generation

### Phase 3: Frontend
- [ ] Onboarding chat flow (3 conversational questions)
- [ ] Interpretation review with editable metric cards
- [ ] Personalized dashboard with Recharts visualizations
- [ ] Canonical (standard) view toggle
- [ ] Refinement suggestion toasts

### Phase 4: Deploy
- [ ] Dockerfile (multi-stage build)
- [ ] GitHub repo creation and push
- [ ] Railway deployment with env vars
- [ ] End-to-end verification

## Key Implementation Requirements

### Claude Response Parsing

```typescript
// CORRECT - validate and fallback
try {
  const parsed = JSON.parse(response);
  if (!parsed.metrics || !Array.isArray(parsed.metrics)) {
    throw new Error('Invalid config structure');
  }
  return parsed as DashboardConfig;
} catch (e) {
  return getCanonicalConfig(); // fallback to defaults
}

// WRONG - trust Claude output blindly
return JSON.parse(response) as DashboardConfig;
```

### Threshold Evaluation

```typescript
// CORRECT - explicit boundaries
function getHealthStatus(value: number, thresholds: ThresholdConfig): 'healthy' | 'warning' | 'critical' {
  if (value <= thresholds.green.max) return 'healthy';
  if (value <= thresholds.yellow.max) return 'warning';
  return 'critical';
}

// WRONG - inverted thresholds for "higher is better" metrics without handling
// Some metrics like sla_compliance are "higher is better" -- handle inversion
```

## Common Pitfalls to Avoid

### DON'T:
- Call Claude API from the frontend (API key exposure)
- Hardcode metric IDs in dashboard components (use config-driven rendering)
- Store user configs in localStorage (use server-side store for demo consistency)
- Block the onboarding flow with per-question Claude calls (batch all input, one call)

### DO:
- Proxy all /api calls through Vite dev server config
- Show Claude's interpretation explicitly before rendering dashboard
- Provide a canonical fallback view that doesn't require Claude
- Use the shared types package for all data structures crossing client/server boundary

## External Integrations

### Required Services

1. **Anthropic Claude API** (`@anthropic-ai/sdk`):
   - Interprets natural language into dashboard configurations
   - Generates refinement suggestions from interaction patterns
   - Model: claude-sonnet-4-20250514 (fast, cost-effective for structured output)
   - Rate limits: Standard API tier

### Integration Best Practices

1. **Rate Limiting**: One Claude call per onboarding completion (not per question)
2. **Error Handling**: Fall back to canonical config if Claude is unavailable
3. **Response Validation**: Parse and validate JSON structure before using

## Version Control Guidelines

### Commit Messages

Follow conventional commits:
```
feat: Add onboarding chat flow
fix: Handle malformed Claude JSON response
docs: Update session status after Phase 2
refactor: Extract threshold evaluation to shared utils
```

### What to Commit

Commit: source code, tests, documentation, config templates, package files

Never commit: `.env`, `node_modules/`, `dist/`, raw data files

## Success Criteria

A feature is "done" when:

- [ ] Implementation matches proposal specification
- [ ] Error handling is robust (especially Claude API responses)
- [ ] Code is typed and follows shared interface contracts
- [ ] Code is committed and pushed

---

*Last Updated: Review and update SESSION_STATUS.md at the end of EVERY session.*
