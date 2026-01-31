# CONTROLA-004: Implement Task Query Endpoints

## Goal
Create REST API endpoints for querying and filtering tasks.

## Requirements
- GET /tasks - list all tasks with pagination
- GET /tasks/:id - get specific task details
- Support filtering by status, priority, feature
- Support sorting by various fields
- Include task metadata and timestamps

## Dependencies
- CONTROLA-001 (Control API Plugin)

## Technical Notes
- Use query parameters for filtering and pagination
- Return consistent JSON response format
- Include total count for pagination
- Support field selection

## Success Criteria
- All endpoints working correctly
- Filtering and sorting functional
- Pagination implemented
- Documentation updated
- Tests passing
