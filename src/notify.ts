import { log } from "./log";

export const TELEGRAM_MAX_LENGTH = 4000;
export const DISCORD_MAX_LENGTH = 1900;

type NotificationTargets = {
  telegramToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  dryRun: boolean;
};

export function getTargets(): NotificationTargets {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    dryRun: process.env.DRY_RUN === "true"
  };
}

export function chunkMessage(message: string, maxLen: number): string[] {
  if (message.length <= maxLen) {
    return [message];
  }

  const parts: string[] = [];
  const blocks = message.split("\n\n");
  let current = "";

  const pushCurrent = () => {
    if (current) {
      parts.push(current);
      current = "";
    }
  };

  const pushHard = (text: string) => {
    for (let i = 0; i < text.length; i += maxLen) {
      parts.push(text.slice(i, i + maxLen));
    }
  };

  for (const block of blocks) {
    if (block.length > maxLen) {
      pushCurrent();
      pushHard(block);
      continue;
    }
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > maxLen) {
      pushCurrent();
      current = block;
    } else {
      current = next;
    }
  }

  pushCurrent();
  return parts.length > 0 ? parts : [message.slice(0, maxLen)];
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 500);
  } catch {
    return "";
  }
}

async function sendTelegram(token: string, chatId: string, message: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Telegram error: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`);
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: message }),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(`Discord error: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`);
  }
}

async function sendChunks(
  chunks: string[],
  send: (chunk: string) => Promise<void>
): Promise<void> {
  for (const chunk of chunks) {
    await send(chunk);
  }
}

export async function sendNotifications(message: string): Promise<void> {
  const targets = getTargets();

  if (targets.dryRun) {
    log.info("DRY_RUN enabled, skipping notifications");
    console.log(message);
    return;
  }

  const tasks: Promise<void>[] = [];

  if (targets.telegramToken && targets.telegramChatId) {
    const chunks = chunkMessage(message, TELEGRAM_MAX_LENGTH);
    tasks.push(
      sendChunks(chunks, (chunk) => sendTelegram(targets.telegramToken!, targets.telegramChatId!, chunk))
    );
  }

  if (targets.discordWebhookUrl) {
    const chunks = chunkMessage(message, DISCORD_MAX_LENGTH);
    tasks.push(sendChunks(chunks, (chunk) => sendDiscord(targets.discordWebhookUrl!, chunk)));
  }

  if (tasks.length === 0) {
    log.error(
      "NOTIFICATION FAILED: No targets configured. Set TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID or DISCORD_WEBHOOK_URL"
    );
    return;
  }

  const results = await Promise.allSettled(tasks);
  let successCount = 0;
  let failCount = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      log.error("NOTIFICATION FAILED:", result.reason);
      failCount++;
    } else {
      successCount++;
    }
  }
  log.info(`Notification results: ${successCount} sent, ${failCount} failed`);

  if (failCount > 0 && successCount === 0) {
    throw new Error("All notification channels failed");
  }
}
