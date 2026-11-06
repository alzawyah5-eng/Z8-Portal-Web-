# Project context

Z8 Card Flow is a React/Vite web app backed by the local NestJS/PostgreSQL API in `../Backend_z8-card-flow`. Firebase handles Google sign-in and push delivery. PhotonPay provides card issuing and transaction services.

## Local development

- Configure `.env.local` from `.env.example`; `VITE_Z8_API_URL` must point to the API's `/v1` base URL.
- Start PostgreSQL and the API from `../Backend_z8-card-flow` using its README, then run `npm.cmd run dev` here.
- Use the API client in `src/api/z8Client.js` for application data, authentication, workflows, and notifications. Keep server credentials and PhotonPay secrets out of Vite variables.

## Security

- Preserve local `.env.local` and backend `.env` secrets; never print or commit them.
- Treat cardholder identity documents, funding proofs, tokens, and provider logs as sensitive.
- Enforce role and ownership checks in the backend; the UI is not an authorization boundary.
- Run relevant builds and static checks before finishing code changes.
