# AI Chat Bot

[![CI](https://github.com/mubaraksalisu/AI-Customer-Support-API/actions/workflows/ci.yml/badge.svg)](https://github.com/mubaraksalisu/AI-Customer-Support-API/actions/workflows/ci.yml)

A NestJS backend for an AI-powered customer support agent. It answers customer
questions using **retrieval-augmented generation (RAG)** over a business FAQ
knowledge base, can call a **tool** to look up real order status from a
Postgres database, and remembers **multi-turn conversation history** per
session — all backed by Google Gemini, available both as a regular JSON
response (`POST /chat`) and as a token-by-token stream (`GET /chat/stream`).

## How it works

1. A customer question comes in through `POST /chat` or `GET /chat/stream`,
   along with an optional session id (`x-session-id` header for `/chat`,
   `sessionId` query param for `/chat/stream`). If omitted, a new session id
   is generated and returned to the caller so follow-up questions can reuse it.
2. Prior turns for that session are loaded from Postgres (`ConversationsService`)
   and prepended to the prompt, so the model has multi-turn context.
3. The question is embedded and matched against FAQ entries stored in Postgres
   using [pgvector](https://github.com/pgvector/pgvector) cosine similarity —
   this is the retrieval step.
4. The top matching FAQs are injected into the prompt as context, along with a
   system prompt that constrains the model to only answer from that context.
5. If the customer is asking about an order, Gemini calls the
   `check_order_status` tool instead of answering directly (looping up to 5
   rounds if needed). The server executes the real lookup against the
   `orders` table and sends the result back to the model for a final answer.
6. The user's question and the model's final answer are both saved back to
   the session's history for the next turn.
7. For `POST /chat`, the model's response is parsed out of `<answer>`/
   `<confidence>` tags and returned as structured JSON. For `GET /chat/stream`,
   plain-text answer chunks are streamed over Server-Sent Events, preceded by
   a leading `event: session` event carrying the resolved session id.

```
Customer question + sessionId
      │
      ▼
ConversationsService.getHistory()  ──▶  prior turns (Postgres)
      │
      ▼
FaqService.findRelevant()  ──▶  pgvector similarity search (Postgres)
      │
      ▼
ChatService.chat() / .chatStream()  ──▶  Gemini (history + FAQ context + check_order_status tool)
      │                              │
      │                              ▼ (if tool call requested, up to 5 rounds)
      │                        OrdersService.getOrderStatus()  ──▶  Postgres
      │                              │
      ◀──────────────────────────────┘
      ▼
ConversationsService.saveMessage()  ──▶  persist user + model turns (Postgres)
      ▼
{ answer, confidence, tool_used, context_used, sessionId }  (or an SSE stream)
```

## Features

- **RAG-based FAQ answering** — FAQ entries are embedded with Gemini
  (`gemini-embedding-001`) and stored in Postgres as vectors; retrieval uses a
  pgvector `<=>` (cosine distance) query.
- **Multi-turn conversation history** — each session's turns are persisted in
  Postgres and replayed to the model on every request, for both `/chat` and
  `/chat/stream`.
- **Tool/function calling** — the model can invoke `check_order_status` to look
  up a real order by number, rather than guessing, looping up to 5 rounds if
  multiple tool calls are needed.
- **Streaming responses** — `GET /chat/stream` streams the model's answer
  token-by-token over Server-Sent Events, with the same history/tool-calling
  behavior as `POST /chat`.
- **Input validation** — request bodies/query params are validated with
  `class-validator` via a global `ValidationPipe`.
- **Grounded responses** — the system prompt forces the model to say "I don't
  have that information" rather than hallucinate, and to self-report a
  confidence level.

## Tech stack

- [NestJS](https://nestjs.com/) + TypeScript
- [PostgreSQL](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) via TypeORM
- [Google Gemini API](https://ai.google.dev/) (`@google/generative-ai`) for chat, tool calling, and embeddings
- Jest + Supertest for unit and integration tests

## Project structure

```
src/
├── chat/            # /chat + /chat/stream controllers, RAG + tool-calling orchestration, DTOs
├── conversations/   # Conversation entity + service — per-session message history
├── faq/             # FAQ entity, embedding + pgvector similarity search, seed data/script
├── orders/          # Order entity, order-status lookup used by the tool call
├── app.controller.ts # GET / readiness route
└── main.ts          # app bootstrap, global ValidationPipe
docker/
└── init/            # SQL run on first Postgres container start (enables pgvector)
docker-compose.yml   # Postgres + pgvector for local development
```

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for Postgres + pgvector), or a Postgres 16+ instance with the
  `vector` extension available
- A [Gemini API key](https://aistudio.google.com/apikey)

### Setup

```bash
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY and FAQ_SEED_SECRET
docker compose up -d   # starts Postgres with pgvector enabled
```

There are no migrations yet, so a fresh database has no tables. For the
**first run only**, set `DB_SYNCHRONIZE=true` in `.env` so TypeORM creates
the schema, then set it back to `false` (or unset it):

```bash
npm run start:dev   # with DB_SYNCHRONIZE=true, creates the schema, then Ctrl+C
# set DB_SYNCHRONIZE back to false in .env
npm run start:dev
```

FAQ seeding is decoupled from app startup — the app does **not** seed itself
on boot. Seed the FAQ table with:

```bash
npm run seed:faq
```

or, on hosts with no shell access (e.g. Render/Railway free tiers), send the
seed request over HTTP with the secret from `FAQ_SEED_SECRET`:

```bash
curl -X POST http://localhost:3000/faq/seed -H "x-seed-secret: $FAQ_SEED_SECRET"
```

The `orders` table starts empty — to test the `check_order_status` tool,
insert a row:

```sql
INSERT INTO orders (order_number, customer_name, status, item)
VALUES ('ORD-001', 'Jane Doe', 'shipped', 'Wireless Mouse');
```

### Environment variables

| Variable           | Description                                                                  |
| ------------------ | ----------------------------------------------------------------------------- |
| `GEMINI_API_KEY`   | API key for Google Gemini                                                     |
| `DATABASE_URL`     | Postgres connection string (e.g. `postgres://admin:admin123@localhost:5432/ai-chat-bot`; on Railway set to `${{ Postgres.DATABASE_URL }}`) |
| `FAQ_SEED_SECRET`  | Secret required to call `POST /faq/seed` in environments with no shell access. Set a long random value in production. |
| `DB_SYNCHRONIZE`   | Set to `true` to let TypeORM create the schema on a fresh database (no migrations exist yet). Defaults to `false`; leave it off outside of first-run setup. |

## API

Interactive OpenAPI docs are served at `http://localhost:3000/docs` once the
app is running (raw spec at `/docs-json`).

### `GET /`

Plain readiness check — returns `"App ready to process request"`. Useful as
an uptime-monitor or host health-check target.

### `POST /chat`

Pass an `x-session-id` header to continue an existing conversation; omit it
to start a new one — the resolved id is always returned in the response so
the client can reuse it on the next request.

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -H 'x-session-id: 123e4567-e89b-12d3-a456-426614174000' \
  -d '{"question":"What are your business hours?"}'
```

```json
{
  "answer": "We are open Monday to Saturday, 8am to 6pm WAT.",
  "confidence": "high",
  "tool_used": false,
  "context_used": ["What are your business hours?", "..."],
  "sessionId": "123e4567-e89b-12d3-a456-426614174000"
}
```

### `GET /chat/stream`

Streams the answer as Server-Sent Events, sharing the same conversation
history and tool-calling behavior as `POST /chat`. Pass a `sessionId` query
param to continue an existing conversation; omit it to start a new one. The
resolved session id is always sent first as a leading `event: session`
message (since a plain SSE stream has no JSON body to return it in), followed
by plain-text answer chunks, ending with a `data: [DONE]` event.

```bash
curl -N "http://localhost:3000/chat/stream?question=What+are+your+delivery+options&sessionId=123e4567-e89b-12d3-a456-426614174000"
```

```
event: session
data: 123e4567-e89b-12d3-a456-426614174000

data: We offer standard delivery

data:  (3-5 business days)...

data: [DONE]
```

### `POST /faq/seed`

Re-seeds the FAQ table. Requires an `x-seed-secret` header matching
`FAQ_SEED_SECRET`. See [Getting started](#getting-started) above.

## Testing

```bash
npm run lint      # eslint (type-aware, auto-fixes on save)
npm test          # unit tests (services, mocked Gemini/DB)
npm run test:e2e  # integration tests (HTTP + validation pipeline)
npm run test:cov  # coverage report
```

`npm run test:e2e` boots the real `AppModule` against Postgres (only the
Gemini SDK is mocked), so `docker compose up -d` must be running first.

CI (`.github/workflows/ci.yml`) runs lint, build, unit, and e2e tests on
every push/PR to `main` against a fresh Postgres service container (with
`DB_SYNCHRONIZE=true`, since that container has no schema to start with).

## Known limitations

This is a portfolio/demo project, not production-hardened:

- No authentication/authorization on the chat endpoints.
- No rate limiting on an endpoint that calls a paid external API.
- No migration system — `synchronize` is disabled (to avoid unintended schema
  changes against a shared dev/prod database), so table creation/schema
  changes currently have to be applied manually.
