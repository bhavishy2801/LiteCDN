# LiteCDN Production Demo Platform

This folder contains a fully separate production-oriented CDN demo implementation.

## Services

- `services/control-plane`: topology, origin config, edge registry.
- `services/origin`: content source and upload API.
- `services/edge`: cache-enabled edge node (SEGMENTED cache only).
- `services/gateway`: ALPHA_BETA_EPSILON routing, telemetry, admin APIs.
- `web-ui`: modern operator dashboard.

## One-command start

```bash
docker compose up --build -d
```

## Scale edges

```bash
docker compose up -d --scale edge=3
```

## URLs

- Dashboard: `http://localhost:8088`
- Gateway API: `http://localhost:8081`
- Control Plane API: `http://localhost:8080`
- Origin API: `http://localhost:4000`

## Documentation

- Architecture: `docs/architecture.md`
- Deployment: `docs/deployment.md`

## Notes

- This implementation is isolated from your current simulation/testing website and pages.
- Existing code under `backend/`, `frontend/`, and previous `production/` paths is untouched.
