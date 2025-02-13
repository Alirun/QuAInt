import { Plugin } from "@elizaos/core";
import { AvailableUnderlyingAssetsProvider, IndexPricesProvider } from "./providers/index.ts";
import { CheckIfOptionIsAvailable, GetAvailableOptions, GetOptionPriceAction, PlaceOrderAction } from "./actions/index.ts";

export const derivativesPlugin: Plugin = {
  name: "derivatives",
  description: "Plugin that enables derivatives trading",
  actions: [
    CheckIfOptionIsAvailable,
    GetAvailableOptions,
    GetOptionPriceAction,
    PlaceOrderAction,
  ],
  providers: [
    AvailableUnderlyingAssetsProvider,
    IndexPricesProvider,
  ],
  evaluators: [
  ],
  services: [],
};

export default derivativesPlugin
