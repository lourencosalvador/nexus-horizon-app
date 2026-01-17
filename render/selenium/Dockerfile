FROM selenium/standalone-chrome:latest

USER root

# Render routes public traffic to $PORT. The official selenium image listens on 4444.
# We install a tiny TCP forwarder (socat) and run it under supervisord so the service
# becomes reachable on $PORT without changing Selenium internals.
RUN apt-get update \
  && apt-get install -y --no-install-recommends socat \
  && rm -rf /var/lib/apt/lists/*

COPY render/selenium/render-port-proxy.conf /etc/supervisor/conf.d/render-port-proxy.conf

USER seluser

