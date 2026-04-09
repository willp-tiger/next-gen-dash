# User Test Plan - Prompt-Guided Dashboard

## How to Run
1. Ensure `npm run dev` is running
2. Open the app in your browser (http://localhost:5175 or whichever port Vite assigned)
3. Follow each test scenario below
4. Record PASS/FAIL and notes in the Results column

---

## Test 1: Onboarding Conversation Quality

**Goal:** Verify the LLM asks relevant, adaptive follow-up questions.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1a | Start fresh (click "Start Over" if needed) | First message is a question about your role | |
| 1b | Answer: "I manage a vehicle processing facility" | Follow-up references vehicles/processing, not generic queues | |
| 1c | Answer: "I need to track inventory in pre-WIP and WIP" | Follow-up asks about targets or thresholds specific to inventory/throughput | |
| 1d | Answer: "We need to process 72 vehicles/hour, 600/day" | LLM signals it has enough info and dashboard starts building | |

**What to watch for:**
- Does the LLM reference YOUR domain in follow-ups (vehicles, inventory, WIP)?
- Does it avoid generic queue/call-center language?
- Does it stop asking after 2-4 exchanges, not more?

---

## Test 2: KPI Generation Logic

**Goal:** Understand how the tool maps your natural language into specific KPIs, thresholds, and chart types.

### Scenario A: Operations Manager (throughput-focused)
| Step | Input | What to check on the Interpretation Review screen |
|------|-------|---------------------------------------------------|
| 2a | "I run a vehicle processing line. I track daily throughput and station utilization" | Should generate metrics related to throughput (count/rate), utilization (%), and possibly queue depth |
| 2b | "We target 600 vehicles/day and 72/hour. Anything below 60/hour is a problem" | Thresholds should reflect: green ≤ some value near 72, yellow near 60, direction should be higher-is-better for throughput |
| 2c | Check the Interpretation Summary | Should say something like "focused on throughput and utilization" — NOT "customer wait times" |
| 2d | Check each metric's chart type | Throughput → line or number (trend matters). Utilization → gauge or area. Counts → bar or number |
| 2e | Check metric sizes | Primary concern (throughput) should be "lg". Secondary metrics should be "md" or "sm" |

### Scenario B: Quality Manager (defect-focused)
| Step | Input | What to check |
|------|-------|---------------|
| 2f | Start Over. Say: "I oversee quality control. I need to track defect rates, rework, and first-pass yield" | Metrics should map to quality-related KPIs (escalation_rate → defects, first_contact_resolution → first-pass yield) |
| 2g | "First-pass yield should be above 95%. Defect rate under 3% is good, over 5% is bad" | Green/yellow thresholds should match: yield green.max=95 higher-is-better, defect green.max=3, yellow.max=5 lower-is-better |

### Scenario C: Executive (cost-focused)
| Step | Input | What to check |
|------|-------|---------------|
| 2h | Start Over. Say: "I'm a VP looking at cost efficiency and overall facility performance" | Should prioritize cost_per_ticket, agent_utilization, sla_compliance. Should NOT lead with granular metrics |
| 2i | "Cost per unit should stay under $20. I want to see trends, not just numbers" | Chart types should favor "line" and "area" over "number". Cost threshold green.max should be near 20 |

**Key questions to answer:**
- Does the tool pick metrics that match your domain, even though the available metrics have generic names?
- Are thresholds set from your stated numbers, not arbitrary defaults?
- Does "higher-is-better" vs "lower-is-better" direction make sense for each metric?
- Are chart types appropriate (trends → line, percentages → gauge, volumes → bar)?

---

## Test 3: Interpretation Review & Editing

**Goal:** Verify you can understand and modify the generated config before building.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 3a | Complete any onboarding scenario | Interpretation review screen appears with summary, priorities, and metric cards | |
| 3b | Read the Summary section | Should accurately reflect what you said, not generic text | |
| 3c | Check Priorities section | Should list 2-4 priorities with weight bars. Highest weight = what you emphasized most | |
| 3d | Edit a threshold value (change a number) | Input should be editable. Value updates on screen | |
| 3e | Change a metric's size (sm/md/lg) | Size selector should update | |
| 3f | Click "Looks Good, Build My Dashboard" | Dashboard renders with your config | |
| 3g | Repeat, but click "Try Again" | Returns to onboarding, fresh conversation | |

---

## Test 4: Dashboard Rendering & Health Badges

**Goal:** Verify metrics render correctly with proper health status colors.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 4a | Build a dashboard from any scenario | Grid of metric tiles appears | |
| 4b | Check health badges | Each tile shows green (Healthy), yellow (Warning), or red (Critical) badge | |
| 4c | Wait 10+ seconds | Metric values should auto-refresh (numbers change slightly) | |
| 4d | For a "lower-is-better" metric: verify a LOW value shows green | e.g., if threshold green.max=5 and value is 3, badge should be green | |
| 4e | For a "higher-is-better" metric: verify a HIGH value shows green | e.g., if threshold green.max=95 and value is 97, badge should be green | |
| 4f | Check chart tiles | Line/bar/area charts should render with 24 data points of trend data | |
| 4g | Check "lg" metrics are visually larger than "sm" metrics | Large tiles should be more prominent in the grid | |

---

## Test 5: Canonical (Standard) View Toggle

**Goal:** Verify the shared baseline view works independently of personalization.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 5a | From any dashboard, click "Standard View" | Dashboard switches to show ALL 12 metrics in a standard layout | |
| 5b | Compare to "My View" | Standard view should have more metrics. My View should be personalized | |
| 5c | Toggle back to "My View" | Returns to your personalized dashboard | |

---

## Test 6: Refinement Suggestions (Phase 3)

**Goal:** Verify the system detects interaction patterns and suggests changes.

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 6a | Build a dashboard with only 2-3 metrics | Dashboard renders with limited metrics | |
| 6b | Click rapidly on the Standard View toggle and back to see all metrics. Click on specific metric tiles 4+ times | Interaction events are being logged (check browser Network tab for POST /api/refinement/log) | |
| 6c | Wait up to 30 seconds | A suggestion banner may appear: "You've been interacting with X frequently. Add it to your dashboard?" | |
| 6d | Click "Yes, add it" on a suggestion | Metric should be added to your dashboard | |
| 6e | Click "Not now" on a suggestion | Banner dismisses, metric not added | |

**Note:** Refinement suggestions require enough interaction data. If no banner appears, check the API directly:
```
curl http://localhost:3000/api/refinement/suggestions/YOUR_USER_ID
```

---

## Test 7: Error Handling & Edge Cases

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 7a | In onboarding, send a single word like "hi" | LLM should ask a clarifying question, not crash | |
| 7b | Send gibberish: "asdfjkl;" | LLM should handle gracefully, ask what you need | |
| 7c | Give contradictory info: "I need everything above 100% and below 0%" | System should still generate a config (may use defaults for unclear thresholds) | |
| 7d | Stop the backend (Ctrl+C on server) and try to send a message | Should show an error message, not a blank screen | |
| 7e | Restart backend and click "Start Over" | Should work normally again | |

---

## Test 8: Cross-Persona Consistency

**Goal:** Verify that two different personas get meaningfully different dashboards.

| Step | Action | What to compare |
|------|--------|-----------------|
| 8a | Complete onboarding as an operations manager focused on throughput | Note the metrics, thresholds, and chart types |
| 8b | Click "Start Over" and complete as an executive focused on costs | Note the metrics, thresholds, and chart types |
| 8c | Compare | Operations should have more granular, real-time metrics. Executive should have higher-level, trend-based metrics. Thresholds should differ. Chart types may differ (exec may see more lines/areas, ops may see more numbers/gauges) |

---

## What to Log

For each test, note:
1. **PASS / FAIL / PARTIAL**
2. **KPI Mapping:** Which available metric ID did the system choose for your concept? (e.g., "first-pass yield" → `first_contact_resolution`)
3. **Threshold Logic:** Were green/yellow values sensible? Did they use your stated numbers?
4. **Direction:** Was higher-is-better / lower-is-better correct for each metric?
5. **Chart Type:** Was it appropriate for the data type?
6. **Surprises:** Anything unexpected — good or bad
