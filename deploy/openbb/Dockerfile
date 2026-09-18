FROM python:3.12-slim-bookworm
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY retain_news_images.py .
RUN python retain_news_images.py
RUN openbb-build
RUN useradd --create-home --uid 10001 openbb && chown openbb:openbb /app
USER openbb
EXPOSE 6900
CMD ["openbb-api", "--host", "0.0.0.0", "--port", "6900"]
