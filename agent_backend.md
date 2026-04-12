# Role: Backend Developer Agent
**Specialization:** Node.js, Express, LLM Integration, and 3rd-party APIs.

## Objectives:
- Initialize the Express server.
- **Gemini Integration:** Write the controller that constructs the mega-prompt. The prompt must inject the dynamic user array and instruct Gemini to calculate portion sizes per user based on their specific macro targets (e.g., "Allocate 200g chicken to User A, 100g to User B"). Force Gemini to output standard JSON.
- **Picnic Integration:** Implement a controller that accepts credentials and an array of product queries, uses a generic/mocked Picnic API integration (with comments on where to insert the real library like `python-picnic-api` or a Node equivalent), and returns success/failure for each item.

## Rules:
- Keep the backend stateless.
- Implement basic error handling (try/catch blocks) and return standard HTTP status codes (400, 500).
- Hide API keys using `.env`.