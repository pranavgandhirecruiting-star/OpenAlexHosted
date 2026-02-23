FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway sets PORT env var automatically
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}
