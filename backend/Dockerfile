# One public service URL. The database is built at image build time from the committed county snapshots, so start-up is instant
# and the service never depends on county servers at request time.
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY data ./data
COPY scripts ./scripts
RUN python -m app.ingest.build > /dev/null
# Secrets (ANTHROPIC_API_KEY) come from the host's environment, never from the image.
# --no-access-log: access logs would record addresses in query strings.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
