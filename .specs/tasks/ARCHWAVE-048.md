# ARCHWAVE-048: Define Agent Orchestration Contracts

## Goal
Create the interface definitions for the agent system to decouple logic from the runner. Define `IAgent`, `ITool`, `IAgentRegistry`, and `AgentResponse`. This establishes the contract for the new agents package.

HOW: Add strict TypeScript interfaces. Ensure `IAgent` supports `plan()` and `execute()` methods. `IAgentRegistry` should allow registering agents by ID.

WHY: Decoupling allows easier testing and swapping of agent implementations.
## Files
- `packages/contracts/src/agent.ts`
- `packages/contracts/src/index.ts`
**Estimated Time:** 30-45 min
**Complexity:** ★★☆☆☆ (2/5)

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling
## Edge Cases to Handle
- Ensure generic types for Tool input/output

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
## Test Strategy
Verify TS compilation and type exports
