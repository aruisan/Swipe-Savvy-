# Architectural & Engineering Decisions

## 1. Integer-Only Monetary Arithmetic (Cents)
- **Decision:** All currency amounts (`totalCents`, `amountCents`) are stored as 32-bit integers (`INT`) in PostgreSQL and operated strictly as integers in TypeScript.
- **Rationale:** Eliminates IEEE 754 floating-point rounding drift (e.g., `0.1 + 0.2 !== 0.3`). SQL `CHECK (amount_cents > 0)` constraints enforce domain invariants at the storage layer.

## 2. Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)
- **Decision:** Concurrent payments against the same order acquire `SELECT ... FROM orders WHERE id = $1 FOR UPDATE`. Concurrent refunds acquire `FOR UPDATE` on `orders` first, then on the target `payments` row.
- **Rationale:** Serializes competing transactions on the exact affected row without locking unrelated orders. Strict parent-to-child lock ordering (`orders` -> `payments`) prevents deadlocks between concurrent payments and refunds.

## 3. Transactional Idempotency (`Idempotency-Key`)
- **Decision:** Every mutation (`POST /payments`, `POST /refunds`) requires an `Idempotency-Key` header. Keys are hashed alongside the JSON payload (`SHA-256`) and inserted atomically via `INSERT ... ON CONFLICT DO NOTHING` inside the same database transaction as the ledger mutation.
- **Rationale:** Guarantees that network retries return the exact cached HTTP `201` payload without double-charging, while rejecting key reuse with modified payloads (`422 Unprocessable Entity`). If business validation fails, the transaction rolls back cleanly so the key is not permanently burned.

## 4. Zero-Downtime Blue-Green Deployment
- **Decision:** Two identical stateless API containers (`api_blue` and `api_green`) share PostgreSQL 16 behind an Nginx reverse proxy (`:8080`). `scripts/cutover.sh` verifies `/healthz` on the target node before updating `nginx/upstream.conf` and issuing `nginx -s reload`.
- **Rationale:** `nginx -s reload` spawns new worker processes with the updated upstream while allowing existing workers to finish active requests gracefully, achieving zero dropped connections.