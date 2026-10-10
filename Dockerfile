# ---------- 1) Frontend ----------
FROM node:20-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build   # natija: /src/backend/frontend_build (modellar bilan)

# ---------- 2) Backend ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements-prod.txt ./
RUN pip install -r requirements-prod.txt
COPY backend/ ./
COPY --from=web /src/backend/frontend_build ./frontend_build
RUN useradd -m schoolpro && mkdir -p media staticfiles && chown -R schoolpro /app
USER schoolpro
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health/' % os.getenv('PORT','8000'))" || exit 1
CMD ["python", "manage.py", "start"]
