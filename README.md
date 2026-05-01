# EBP Notification Service

This service checks 4h candles for configured CME symbols and sends alerts to Telegram and Discord when:
- current low < previous low and current close > previous open
- current high > previous high and current close < previous open

## Setup
1. npm install
2. Copy .env.example to .env and fill in values
3. Edit config/settings.json and config/symbols.json

## Run locally
npm run dev

## Build and run
npm run build
npm start

## One-off run (for cron)
npm run build
node dist/index.js --once

## Configuration
config/settings.json
- timeframe: "240" for 4h candles
- timezone: IANA timezone, defaults to America/Chicago
- cron: cron expression, defaults to minute 1 of every 4 hours
- defaultExchange: used when a symbol has no exchange specified
- runOnStartup: run a check immediately on startup

config/symbols.json
- symbols: list of objects with symbol and optional exchange/name

## Deployment (systemd)
Create a service file like this and enable it:

[Unit]
Description=EBP Notification Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/ebp-notification
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /path/to/ebp-notification/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target

## Deployment (cron)
If you prefer cron, use the one-off mode and let cron trigger it:

1 */4 * * * /usr/bin/node /path/to/ebp-notification/dist/index.js --once

