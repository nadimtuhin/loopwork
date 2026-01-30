# HEALTH-001: Create health check endpoint handler

## Goal
Create a simple HTTP health check endpoint that returns a JSON response indicating the service is healthy.

Requirements:
- Create GET /health endpoint
- Return JSON response: { "status": "ok", "timestamp": "<ISO timestamp>" }
- Return HTTP 200 status code
- No authentication required (public endpoint)

Acceptance Criteria:
- Endpoint responds to GET requests at /health
- Response includes status field with value "ok"
- Response includes current timestamp in ISO format
- Response time is under 100ms

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
