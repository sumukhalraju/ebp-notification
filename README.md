# EBP Notification Service

Checks CME 4H candles (and optional H7 session candles) for configured symbols and sends Telegram / Discord alerts when:

- current low < previous low **and** current close > previous open
- current high > previous high **and** current close < previous open

Requires **Node.js 18+**.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in values. **Do not put real tokens in `.env.example`.**
3. Edit `config/settings.json` and `config/symbols.json`

If a Telegram bot token was ever committed, revoke it in BotFather and issue a new one.

## Run locally

```
npm run dev
```

## Build and run

```
npm run build
npm start
```

## One-off run (for cron)

```
npm run build
npm run once
```

## Tests

```
npm test
```

## Diagnostics

```
npm run diagnose:h4
npm run diagnose:h7
npm run verify:h7
```

## Configuration

`config/settings.json`

| Field | Meaning |
|---|---|
| `timeframe` | Base timeframe in minutes (`"240"` = 4H) |
| `timezone` | IANA zone (CME session times use `America/New_York`) |
| `cron` | When to scan the base timeframe |
| `defaultExchange` | Used when a symbol has no exchange |
| `runOnStartup` | Run a check immediately on startup (4H then H7, serialized) |
| `h7` | Enable 7-hour session candles |
| `h7Cron` | When to scan H7 (default `1 1,8 * * *`) |
| `h7AnchorHours` | 1H bars that start an H7 candle (default `18, 1, 8`) |
| `h7Transitions` | Hour pairs to evaluate (default `18→1` and `1→8`) |
| `lookbackDays` | How much history to fetch after downtime (default `2`) |
| `fetchConcurrency` | Parallel symbol fetches, 1–10 (default `2`) |
| `failureAlertThreshold` | Notify after this many consecutive scan failures (default `3`) |
| `heartbeatCron` | Optional “still alive” message schedule |

`config/symbols.json`

- `symbols`: list of objects with `symbol` and optional `exchange` / `name`

Schedule changes in `settings.json` are picked up without a restart. Changing `timeframe` / `timezone` / H7 flags for the *running jobs* also applies on the next tick.

### Environment

| Variable | Meaning |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Chat or group id |
| `DISCORD_WEBHOOK_URL` | Optional Discord webhook |
| `DRY_RUN` | `true` logs messages instead of sending |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` (default `info`) |

On first run for a symbol (empty `lastChecked`), only the latest closed pair is evaluated so you do not get a dump of historical alerts.

## Deployment (systemd)

```
[Unit]
Description=EBP Notification Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/ebp-notification
Environment=NODE_ENV=production
EnvironmentFile=/path/to/ebp-notification/.env
ExecStart=/usr/bin/node /path/to/ebp-notification/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Build first (`npm run build`). The process waits for an in-flight scan on SIGTERM/SIGINT before exiting.

## Deployment (cron)

If you prefer OS cron instead of the in-process scheduler:

```
1 2,6,10,14,18,22 * * * /usr/bin/node /path/to/ebp-notification/dist/index.js --once
```

Times are wall-clock on the host. Prefer the in-process scheduler with `timezone` set to `America/New_York` so 4H closes at 18/22/02/06/10/14 ET stay aligned.
