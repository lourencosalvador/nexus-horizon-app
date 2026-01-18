FROM selenium/standalone-chrome:latest

USER root

# Render routes public traffic to $PORT. The official selenium image listens on:
# - Selenium: 4444
# - noVNC: 7900
#
# We run a tiny nginx reverse-proxy on $PORT that routes:
# - /      -> 127.0.0.1:4444
# - /vnc/  -> 127.0.0.1:7900 (websocket)
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx gettext-base \
  && rm -rf /var/lib/apt/lists/*

COPY nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY render-nginx.conf /etc/supervisor/conf.d/render-nginx.conf

USER seluser

