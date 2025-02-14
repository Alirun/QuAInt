import { TelegramClientInterface } from "@elizaos/client-telegram";
import { Character, IAgentRuntime } from "@elizaos/core";

import { TraderClient } from "./trader";

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) clients.push(telegramClient);
  }

  if (clientTypes.includes("trader")) {
    const traderClient = await TraderClient.start(
      runtime,
      // @ts-ignore
      {
        iterationMode: 'manual',
      }
    );
    if (traderClient) clients.push(traderClient);
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}
