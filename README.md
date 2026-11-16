# Swipe Savvy — Split-Tender Payment Ledger

A production-grade split-tender payment and refund ledger built with **NestJS**, **Next.js**, **PostgreSQL 16**, **Prisma**, and **Nginx Blue-Green Deployment**.

## Architecture Overview

- **Backend (`backend/`):** NestJS REST API using integer-cent accounting, pessimistic row locking (`SELECT ... FOR UPDATE`), and transactional idempotency (`Idempotency-Key` + SHA-256 payload verification).
- **Frontend (`frontend/`):** Modular Next.js + Tailwind CSS ledger dashboard displaying real-time balances, split-tender payments (`CARD` / `CASH`), per-tender refunds, idempotent retry simulation, and a live `BLUE` / `GREEN` node badge.
- **Proxy & Cutover (`nginx/`, `scripts/cutover.sh`):** Nginx reverse proxy routing `/api/*` to the active API environment (`blue` or `green`) with zero-downtime reloads.

## Quick Start (Full Docker Blue-Green Stack)

1. **Start all services (`postgres`, `api_blue`, `api_green`, `frontend`, `nginx`):**
   ```bash
   docker compose up -d --build