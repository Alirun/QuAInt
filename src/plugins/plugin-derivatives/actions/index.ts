import { createTool } from "@goat-sdk/core";
import { z } from "zod";
import assert from 'assert';
import { elizaLogger } from "@elizaos/core";

import { createAction } from "./utils.ts";
import { getDeribitSingleton } from "../services/deribit-api/index.ts";
import { DeribitCurrency } from "../services/deribit-api/types.ts";

const getActiveInstruments = async (underlyingAsset: DeribitCurrency) => {
  const deribit = getDeribitSingleton();
  const instruments = await deribit.getInstruments(underlyingAsset, 'option', false);
  return instruments.filter(i => i.is_active);
}

const assertAndParseUnderlyingAsset = (underlyingAsset: string) => {
  assert(underlyingAsset, "Underlying asset is required")
  if (underlyingAsset !== 'any') {
    underlyingAsset = underlyingAsset.toUpperCase()
  }
  return underlyingAsset as DeribitCurrency
}

const assertAndParseInstrumentName = (instrumentName: string) => {
  assert(instrumentName, "Instrument name is required")
  instrumentName = instrumentName.toUpperCase()
  return instrumentName
}

export const CheckIfOptionIsAvailable = createAction(createTool(
  {
    name: "check_if_option_is_available",
    description: "Checks the availability of the option for a given instrument <ASSET>-<DMMMYY>-<STRIKE>-<C|P>. It's useful to check option availability before doing anything with it",
    parameters: z.object({
      instrumentName: z.string({ description: "Instrument name in format <ASSET>-<DMMMYY>-<STRIKE>-<C|P>" }),
      underlyingAsset: z.string({ description: "Underlying asset ('BTC' | 'ETH' | 'USDC' | 'USDT' | 'EURR' | 'any')" }),
    }),
  },
  async (parameters) => {
    elizaLogger.info({ parameters })

    const instrumentName = assertAndParseInstrumentName(parameters.instrumentName)
    const underlyingAsset = assertAndParseUnderlyingAsset(parameters.underlyingAsset)

    const activeInstruments = await getActiveInstruments(underlyingAsset)
    return activeInstruments.map(i => i.instrument_name).includes(instrumentName)
  }
))

export const GetAvailableOptions = createAction(createTool(
  {
    name: "get_available_options",
    description: "Get the list of available options for a given underlying asset",
    parameters: z.object({
      underlyingAsset: z.string({ description: "Underlying asset ('BTC' | 'ETH' | 'USDC' | 'USDT' | 'EURR' | 'any')" }),
    }),
  },
  async (parameters) => {
    elizaLogger.info({ parameters })

    const underlyingAsset = assertAndParseUnderlyingAsset(parameters.underlyingAsset)

    const activeInstruments = await getActiveInstruments(underlyingAsset)
    return activeInstruments.map(i => i.instrument_name);
  }
))

export const GetOptionPriceAction = createAction(createTool(
  {
    name: "get_option_price",
    description: "Get the market price of the given option instrument <ASSET>-<DMMMYY>-<STRIKE>-<C|P>",
    parameters: z.object({
      instrumentName: z.string({ description: "Instrument name in format <ASSET>-<DMMMYY>-<STRIKE>-<C|P>" })
    }),
  },
  async (parameters) => {
    elizaLogger.info({ parameters })

    const instrumentName = assertAndParseInstrumentName(parameters.instrumentName)

    const deribit = getDeribitSingleton();
    const instrumentSummary = await deribit.getBookSummaryByInstrument(instrumentName)

    elizaLogger.info({ instrumentSummary })

    return instrumentSummary.mark_price
  }
))

export const PlaceOrderAction = createAction(createTool(
  {
    name: "place_order",
    description: "Place an order for a given option instrument <ASSET>-<DMMMYY>-<STRIKE>-<C|P>",
    parameters: z.object({
      instrumentName: z.string({ description: "Instrument name in format <ASSET>-<DMMMYY>-<STRIKE>-<C|P>" }),
      amount: z.number({ description: "The amount to buy/sell" }),
      type: z.enum(["market", "limit"], { description: "Order type: market or limit" }).optional(),
      price: z.number({ description: "Limit price. Required if type is limit" }).optional(),
      side: z.enum(["buy", "sell"], { description: "Side: buy or sell" }),
    }),
  },
  async (parameters) => {
    elizaLogger.info({ parameters })

    const instrumentName = assertAndParseInstrumentName(parameters.instrumentName)

    if (parameters.type === "limit" && parameters.price === undefined) {
      throw new Error("Limit price is required for limit orders");
    }

    return `Successfully placed ${parameters.side} order for ${parameters.amount} of ${instrumentName} at ${parameters.type === "limit" ? parameters.price : "market price"}`;
  }
))

export const NoneAction = createAction(createTool(
  {
  name: "NONE",
    description: "Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.",
    parameters: z.object({}),
  },
  async () => {
    return true;
  }
))

NoneAction.similes = [
  "NO_ACTION",
  "NO_RESPONSE",
  "NO_REACTION",
  "RESPONSE",
  "REPLY",
  "DEFAULT",
];
