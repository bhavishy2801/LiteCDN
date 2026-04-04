# LiteCDN Production Demo Deployment

## Local Linux Run

1. Go to production platform folder:

```bash
cd production/platform
```

2. Build and run core stack:

```bash
docker compose up --build -d
```

3. Scale edge replicas (example: 4 edges):

```bash
docker compose up -d --scale edge=4
```

4. Open dashboard:

- `http://localhost:8088`

5. Useful checks:

```bash
curl http://localhost:8080/v1/topology
curl http://localhost:8081/api/metrics
curl http://localhost:8081/api/content/welcome.txt
```

## Stop

```bash
docker compose down
```

## Vercel Integration Context

Your existing hosted domain is:

- `https://litecdnn.vercel.app`

This production demo platform is intentionally separate and local/container-first. The dashboard still displays the Vercel control-plane URL as a reference endpoint for your SaaS path.

## Optional Cloud Deployment

- Deploy `control-plane`, `gateway`, and `origin` to one VM (or separate managed containers).
- Deploy `edge` replicas to regional VMs.
- Set `CONTROL_PLANE_URL` for all edges to your public control-plane endpoint.
- Configure TLS + domain routing (Nginx/Traefik) in front of gateway/web-ui.
