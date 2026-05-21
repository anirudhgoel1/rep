# Rep

> DHH top 5, tier list, India Top 50, city pride, defend wall, daily 1v1

**Live:** https://rep.anirudhgoel.xyz/

## Stack

- Cloudflare Workers Static Assets (single-binary deploy)
- Vanilla HTML/CSS/JS, no build step
- PWA · installable, push-enabled
- Design skill: `typeui-editorial`

## Deploy

This repo deploys via the shared [`cluster-cli`](https://github.com/anirudhgoel1/cluster-cli) reusable GitHub Actions workflow. Push to `main` triggers:
1. Wrangler dry-run (PR) / deploy (push)
2. Post-deploy smoke test against https://rep.anirudhgoel.xyz/

Local emergency deploy: `..\ship.ps1 rep` (or `./ship.sh rep` on bash).

## Audit

Run the hard-checklist audit:

```powershell
..\cluster-cli\scripts\audit.ps1 -ProjectDir . -Repo anirudhgoel1/rep -Domain rep.anirudhgoel.xyz
```
