SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose

.PHONY: help install env up down restart logs migrate ensure-app-role ensure-bucket seed dev build start lint typecheck test clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances npm
	npm install

env: ## Crée .env depuis .env.example si absent, génère AUTH_SECRET si besoin
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env créé depuis .env.example"; fi
	@if grep -q '^AUTH_SECRET=changeme' .env; then \
		sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=$$(openssl rand -base64 32)|" .env && rm -f .env.bak; \
		echo "AUTH_SECRET généré dans .env"; \
	fi
	@if ! grep -q '^MIGRATION_DATABASE_URL=' .env; then \
		sed -i.bak '/^DATABASE_URL=/d' .env && rm -f .env.bak; \
		grep -E '^(DATABASE_URL|MIGRATION_DATABASE_URL)=' .env.example >> .env; \
		echo ".env mis à jour : rôle applicatif (DATABASE_URL) et rôle propriétaire (MIGRATION_DATABASE_URL)"; \
	fi
	@if ! grep -q '^WORKER_DATABASE_URL=' .env; then \
		grep -E '^WORKER_DATABASE_URL=' .env.example >> .env; \
		echo ".env mis à jour : rôle du worker de l'outbox (WORKER_DATABASE_URL)"; \
	fi

up: env ## Démarre Postgres, LocalStack et la stack d'observabilité (Docker) ; attend Postgres et LocalStack
	$(COMPOSE) up -d
	@echo "En attente que Postgres et LocalStack soient opérationnels..."
	@for i in $$(seq 1 30); do \
		pg_ok=$$($(COMPOSE) ps postgres 2>/dev/null | grep -c "healthy"); \
		localstack_ok=$$($(COMPOSE) ps localstack 2>/dev/null | grep -c "healthy"); \
		if [ "$$pg_ok" -ge 1 ] && [ "$$localstack_ok" -ge 1 ]; then echo "Postgres + LocalStack prêts."; exit 0; fi; \
		sleep 2; \
	done; \
	echo "Timeout en attendant Postgres/LocalStack — vérifie 'docker compose ps' et 'make logs'." >&2; exit 1

# La stack d'observabilité n'est pas attendue : l'application démarre et
# fonctionne sans elle (ADR 0011). Grafana : http://localhost:3001

observability-config: ## Régénère les tableaux de bord et alertes Grafana (observability/generate.mjs)
	node observability/generate.mjs

down: ## Arrête Postgres, LocalStack et l'observabilité (conserve les données)
	$(COMPOSE) down

restart: down up ## Redémarre Postgres + LocalStack

logs: ## Suit les logs de Postgres + LocalStack
	$(COMPOSE) logs -f

migrate: ## Applique les migrations SQL (idempotent)
	npm run migrate:up

ensure-app-role: ## Ouvre la connexion des rôles expense_app et expense_worker (mots de passe tirés de DATABASE_URL et WORKER_DATABASE_URL)
	npm run ensure-app-role

ensure-bucket: ## Crée le bucket S3 "receipts" s'il n'existe pas déjà
	npm run ensure-bucket

seed: ## Peuple une base de démonstration navigable (RH, manager, employé, notes de frais)
	npm run seed

dev: install up migrate ensure-app-role ensure-bucket seed ## Tout lancer : install, Docker, migrations, rôle applicatif, bucket, seed, puis le serveur de dev
	npm run dev

build: ## Build de production
	npm run build

start: build ## Build puis lance le serveur de prod
	npm run start

lint: ## Lint du code
	npm run lint

typecheck: ## Vérifie les types
	npm run typecheck

test: up ## Lance tous les tests (unitaires + intégration sur la base expense_io_test)
	npm test

clean: ## Arrête Docker et supprime les volumes — efface les données locales (Postgres/LocalStack)
	$(COMPOSE) down -v
