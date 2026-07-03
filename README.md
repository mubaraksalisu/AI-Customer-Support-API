# AI Chat Bot

A NestJS backend for an AI-powered customer support agent. It answers customer
questions using **retrieval-augmented generation (RAG)** over a business FAQ
knowledge base, and can call a **tool** to look up real order status from a
Postgres database — all backed by Google Gemini.

## How it works

1. A customer question comes in through `POST /chat`.
2. The question is embedded and matched against FAQ entries stored in Postgres
   using [pgvector](https://github.com/pgvector/pgvector) cosine similarity —
   this is the retrieval step.
3. The top matching FAQs are injected into the prompt as context, along with a
   system prompt that constrains the model to only answer from that context.
4. If the customer is asking about an order, Gemini calls the
   `check_order_status` tool instead of answering directly. The server executes
   the real lookup against the `orders` table and sends the result back to the
   model for a final answer.
5. The model's response is parsed out of `<answer>`/`<confidence>` tags and
   returned as structured JSON.

```
Customer question
      │
      ▼
FaqService.findRelevant()  ──▶  pgvector similarity search (Postgres)
      │
      ▼
ChatService.chat()  ──▶  Gemini (with FAQ context + check_order_status tool)
      │                              │
      │                              ▼ (if tool call requested)
      │                        OrdersService.getOrderStatus()  ──▶  Postgres
      │                              │
      ◀──────────────────────────────┘
      ▼
{ answer, confidence, tool_used, context_used }
```

## Features

- **RAG-based FAQ answering** — FAQ entries are embedded with Gemini
  (`gemini-embedding-001`) and stored in Postgres as vectors; retrieval uses a
  pgvector `<=>` (cosine distance) query.
- **Tool/function calling** — the model can invoke `check_order_status` to look
  up a real order by number, rather than guessing.
- **Streaming responses** — `GET /chat/stream` streams the model's answer
  token-by-token over Server-Sent Events.
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
├── chat/           # /chat controller, RAG + tool-calling orchestration, DTOs
├── faq/             # FAQ entity, embedding + pgvector similarity search
├── orders/          # Order entity, order-status lookup used by the tool call
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
cp .env.example .env   # then fill in GEMINI_API_KEY
docker compose up -d   # starts Postgres with pgvector enabled
npm run start:dev
```

On first boot, `FaqService` seeds the FAQ table automatically. The `orders`
table starts empty — to test the `check_order_status` tool, insert a row:

```sql
INSERT INTO orders (order_number, customer_name, status, item)
VALUES ('ORD-001', 'Jane Doe', 'shipped', 'Wireless Mouse');
```

### Environment variables

| Variable          | Description                                   |
| ----------------- | ---------------------------------------------- |
| `GEMINI_API_KEY`  | API key for Google Gemini                      |
| `DB_HOST`         | Postgres host (`localhost` with docker-compose) |
| `DB_PORT`         | Postgres port (`5432` by default)              |
| `DB_USER`         | Postgres user                                  |
| `DB_PASS`         | Postgres password                              |
| `DB_NAME`         | Postgres database name                         |

## API

Interactive OpenAPI docs are served at `http://localhost:3000/docs` once the
app is running (raw spec at `/docs-json`).

### `POST /chat`

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"What are your business hours?"}'
```

```json
{
  "answer": "We are open Monday to Saturday, 8am to 6pm WAT.",
  "confidence": "high",
  "tool_used": false,
  "context_used": ["What are your business hours?", "..."]
}
```

### `GET /chat/stream`

Streams the answer as Server-Sent Events, ending with a `[DONE]` event.

```bash
curl -N "http://localhost:3000/chat/stream?question=What+are+your+delivery+options"
```

## Testing

```bash
npm test          # unit tests (services, mocked Gemini/DB)
npm run test:e2e  # integration tests (HTTP + validation pipeline)
npm run test:cov  # coverage report
```

## Known limitations

This is a portfolio/demo project, not production-hardened:

- No authentication/authorization on the chat endpoints.
- No rate limiting on an endpoint that calls a paid external API.
- `synchronize: true` is used for schema sync instead of migrations.
