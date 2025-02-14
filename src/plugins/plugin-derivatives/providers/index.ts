/** Providers */

import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core"

import { getDeribitSingleton } from '../services/deribit-api/index.ts'

// IndexPricesProvider
export const AvailableUnderlyingAssetsProvider: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    return `Available underlying assets:
\t- ETH`
  }
}

export const IndexPricesProvider: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    const deribit = getDeribitSingleton()
    const indexResult = await deribit.getIndexPrice('eth_usd')
    return `Current index prices:
\t- ETH/USD: ${indexResult.index_price}`
  }
}

export const TimeProvider: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    const currentDate = new Date();

    // Get UTC time since bots will be communicating with users around the global
    const options = {
      timeZone: "UTC",
      dateStyle: "full" as const,
      timeStyle: "long" as const,
    };
    const humanReadable = new Intl.DateTimeFormat("en-US", options).format(
      currentDate
    );
    return `The current date and time is ${humanReadable}. Please use this as your reference for any time-based operations or responses.`;
  },
};

