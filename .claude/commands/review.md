# Independent Review

Launch a subagent with clean context to review the last batch of completed work.

The subagent must:

1. Read `implementation/task_tracker.md` to identify recently completed items
2. Read `implementation/user_journeys.md` to check acceptance criteria
3. For each completed User Journey:
   - Verify backend endpoints exist and have auth checks
   - Verify frontend page exists and is reachable from navigation
   - Verify the security checklist was applied
   - Check for functional gaps (missing error states, empty states, navigation links)
   - Check that automated tests exist for critical paths
4. For each completed Infrastructure Task:
   - Verify the component works and is properly integrated
   - Verify the security checklist was applied
5. Write findings to `docs/work_log.md` under a "## Review" entry
6. Flag any critical issues that must be fixed before continuing

If critical issues are found, stop and fix them before advancing to new work.
