type NotificationTargets = {
  telegramToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  dryRun: boolean;
};

function getTargets(): NotificationTargets {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    dryRun: process.env.DRY_RUN === "true"
  };
}

async function sendTelegram(token: string, chatId: string, message: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message })
  });

  if (!response.ok) {
    throw new Error(`Telegram error: ${response.status} ${response.statusText}`);
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: message })
  });

  if (!response.ok) {
    throw new Error(`Discord error: ${response.status} ${response.statusText}`);
  }
}

export async function sendNotifications(message: string): Promise<void> {
  const targets = getTargets();

  if (targets.dryRun) {
    console.log("DRY_RUN enabled, skipping notifications");
    console.log(message);
    return;
  }

  const tasks: Promise<void>[] = [];

  if (targets.telegramToken && targets.telegramChatId) {
    tasks.push(sendTelegram(targets.telegramToken, targets.telegramChatId, message));
  }

  if (targets.discordWebhookUrl) {
    tasks.push(sendDiscord(targets.discordWebhookUrl, message));
  }

  if (tasks.length === 0) {
    console.warn("No notification targets configured; set TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID or DISCORD_WEBHOOK_URL");
    return;
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(result.reason);
    }
  }
}
