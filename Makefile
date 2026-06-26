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
APP_NAME    ?= genie-reports
DEPLOY_STAGE ?= /tmp/$(APP_NAME)-deploy
DEPLOY_PATH ?= /Workspace/Users/$(USER)/$(APP_NAME)
WORKSPACE_SOURCE ?= $(DEPLOY_PATH)
DBX_PROFILE ?= $(DATABRICKS_CONFIG_PROFILE)
DBX_PROFILE_ARG = $(if $(DBX_PROFILE),--profile $(DBX_PROFILE),)

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
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

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
check-env: ## Warn (not fail) if Genie Space config is unset
	@if [ -z "$$GENIE_SPACE_ID" ] && [ -z "$$GENIE_SPACE_URL" ]; then \
		echo "WARNING: no Genie Space is configured — the app will boot, but"; \
		echo "  live questions (/api/ask) will return 400 until you set one:"; \
		echo "  export GENIE_SPACE_URL=https://your-workspace.cloud.databricks.com/genie/rooms/<space-id>"; \
	else \
		echo "Genie Space config is set."; \
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

# ---- Deploy -----------------------------------------------------------------
.PHONY: deploy-info
deploy-info: ## Show Databricks deployment settings
	@echo "APP_NAME=$(APP_NAME)"
	@echo "DEPLOY_STAGE=$(DEPLOY_STAGE)"
	@echo "DEPLOY_PATH=$(DEPLOY_PATH)"
	@echo "WORKSPACE_SOURCE=$(WORKSPACE_SOURCE)"
	@if [ -n "$(DBX_PROFILE)" ]; then echo "DBX_PROFILE=$(DBX_PROFILE)"; fi

.PHONY: deploy-check
deploy-check: ## Verify Databricks CLI authentication
	databricks $(DBX_PROFILE_ARG) current-user me >/dev/null

.PHONY: auth-login
auth-login: ## Login to Databricks CLI using .env host/profile settings
	@if [ -z "$$DATABRICKS_HOST" ]; then \
		echo "DATABRICKS_HOST is not set. Add it to .env or run databricks auth login manually."; \
		exit 1; \
	fi
	databricks $(DBX_PROFILE_ARG) auth login --host "$$DATABRICKS_HOST"

.PHONY: deploy-stage
deploy-stage: build ## Build and stage deployable files in /tmp
	rm -rf "$(DEPLOY_STAGE)"
	mkdir -p "$(DEPLOY_STAGE)"
	cp -R backend "$(DEPLOY_STAGE)/backend"
	cp -R "$(FRONTEND)" "$(DEPLOY_STAGE)/frontend"
	cp app.yaml package.json package-lock.json requirements.txt README.md "$(DEPLOY_STAGE)/"
	rm -rf "$(DEPLOY_STAGE)/frontend/node_modules"
	find "$(DEPLOY_STAGE)" -type d -name __pycache__ -prune -exec rm -rf {} +
	find "$(DEPLOY_STAGE)" -name '*.pyc' -delete
	@echo "Staged deployable app source in $(DEPLOY_STAGE)"

.PHONY: deploy-create
deploy-create: ## Create the Databricks app if it does not already exist
	@if databricks $(DBX_PROFILE_ARG) apps get "$(APP_NAME)" >/dev/null 2>&1; then \
		echo "Databricks app $(APP_NAME) already exists."; \
	else \
		databricks $(DBX_PROFILE_ARG) apps create "$(APP_NAME)" \
			--description "Genie Reports"; \
	fi

.PHONY: deploy-sync
deploy-sync: deploy-stage ## Sync staged app source to Databricks Workspace files
	databricks $(DBX_PROFILE_ARG) sync --full "$(DEPLOY_STAGE)" "$(DEPLOY_PATH)"

.PHONY: deploy-app
deploy-app: deploy-sync ## Deploy the Databricks app from DEPLOY_PATH
	@echo "One-time requirement: attach Genie Space resource key 'genie-space' with permission 'Can run'."
	databricks $(DBX_PROFILE_ARG) apps deploy "$(APP_NAME)" --source-code-path "$(DEPLOY_PATH)"

.PHONY: deploy
deploy: deploy-check deploy-create deploy-app ## Build, sync, and deploy to Databricks Apps

.PHONY: deploy-from-workspace
deploy-from-workspace: deploy-check deploy-create ## Deploy from an existing Workspace/Git folder path
	@echo "One-time requirement: attach Genie Space resource key 'genie-space' with permission 'Can run'."
	databricks $(DBX_PROFILE_ARG) apps deploy "$(APP_NAME)" --source-code-path "$(WORKSPACE_SOURCE)"

.PHONY: deploy-logs
deploy-logs: ## Tail Databricks app logs
	databricks $(DBX_PROFILE_ARG) apps logs "$(APP_NAME)" --follow

# ---- Housekeeping -----------------------------------------------------------
.PHONY: clean
clean: ## Remove venv, build output, and caches
	rm -rf $(VENV) $(FRONTEND)/dist $(FRONTEND)/node_modules
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
