# Genie Reports — local dev Makefile
#
# Quick start:
#   export GENIE_SPACE_ID=xxxxxxxxxxxx
#   databricks auth login --host https://your-workspace.cloud.databricks.com
#   make install
#   make dev        # backend :8000 + frontend :5173
#
# Run `make help` to list all targets.

# ---- Config -----------------------------------------------------------------
PYTHON      ?= python3
VENV        := .venv
VENV_BIN    := $(VENV)/bin
PIP         := $(VENV_BIN)/pip
UVICORN     := $(VENV_BIN)/uvicorn
PORT        ?= 8000
FRONTEND    := frontend

# Use bash so `source` etc. behave predictably.
SHELL := /bin/bash

# Auto-load .env (local dev only) so GENIE_SPACE_ID / Databricks creds are
# available to run targets. Lines in .env are KEY=value; copy .env.example.
ifneq (,$(wildcard .env))
include .env
export
endif

.DEFAULT_GOAL := help

# ---- Help -------------------------------------------------------------------
.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- Setup ------------------------------------------------------------------
.PHONY: install
install: install-backend install-frontend ## Install backend + frontend deps

$(VENV):
	$(PYTHON) -m venv $(VENV)

.PHONY: install-backend
install-backend: $(VENV) ## Create venv and install Python deps
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

.PHONY: install-frontend
install-frontend: ## Install frontend npm deps
	cd $(FRONTEND) && npm install

# ---- Run --------------------------------------------------------------------
.PHONY: check-env
check-env: ## Warn (not fail) if GENIE_SPACE_ID is unset
	@if [ -z "$$GENIE_SPACE_ID" ]; then \
		echo "WARNING: GENIE_SPACE_ID is not set — the app will boot, but"; \
		echo "  live questions (/api/ask) will return 400 until you set it:"; \
		echo "  export GENIE_SPACE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; \
	else \
		echo "GENIE_SPACE_ID is set."; \
	fi

.PHONY: smoke
smoke: ## Boot the API and curl /api/health + /api/config (no Genie needed)
	@$(UVICORN) backend.main:app --port $(PORT) & \
	SERVER_PID=$$!; \
	trap 'kill $$SERVER_PID 2>/dev/null' EXIT; \
	for i in $$(seq 1 20); do \
		curl -sf http://localhost:$(PORT)/api/health >/dev/null && break; sleep 0.5; \
	done; \
	echo "health: $$(curl -s http://localhost:$(PORT)/api/health)"; \
	echo "config: $$(curl -s http://localhost:$(PORT)/api/config)"

.PHONY: backend
backend: check-env ## Run FastAPI backend with reload (port 8000)
	$(UVICORN) backend.main:app --reload --port $(PORT)

.PHONY: frontend
frontend: ## Run Vite dev server (port 5173, proxies /api -> :8000)
	cd $(FRONTEND) && npm run dev

.PHONY: dev
dev: check-env ## Run backend + frontend together (Ctrl-C stops both)
	@echo "Starting backend (:$(PORT)) and frontend (:5173)..."
	@trap 'kill 0' EXIT INT TERM; \
	$(UVICORN) backend.main:app --reload --port $(PORT) & \
	(cd $(FRONTEND) && npm run dev) & \
	wait

# ---- Build / serve all-in-one ----------------------------------------------
.PHONY: build
build: ## Build frontend into frontend/dist (served by FastAPI)
	cd $(FRONTEND) && npm install && npm run build

.PHONY: serve
serve: check-env build ## Build frontend, then serve everything from FastAPI (:8000)
	$(UVICORN) backend.main:app --host 0.0.0.0 --port $(PORT)

# ---- Housekeeping -----------------------------------------------------------
.PHONY: clean
clean: ## Remove venv, build output, and caches
	rm -rf $(VENV) $(FRONTEND)/dist $(FRONTEND)/node_modules
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
