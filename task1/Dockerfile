FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostgreSQL driver
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code into package structure
COPY . /app/task1

# Set python path so module imports (from task1.app...) work seamlessly
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Run Uvicorn production server
CMD ["uvicorn", "task1.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

