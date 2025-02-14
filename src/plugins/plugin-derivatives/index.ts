import { Plugin } from "@elizaos/core";
import { AvailableUnderlyingAssetsProvider, IndexPricesProvider, TimeProvider } from "./providers/index.ts";
import { CheckIfOptionIsAvailable, GetAvailableOptions, GetOptionPriceAction, NoneAction, PlaceOrderAction } from "./actions/index.ts";

export const derivativesPlugin: Plugin = {
  name: "derivatives",
  description: "Plugin that enables derivatives trading",
  actions: [
    NoneAction,
    CheckIfOptionIsAvailable,
    GetAvailableOptions,
    GetOptionPriceAction,
    PlaceOrderAction,
  ],
  providers: [
    TimeProvider,
    AvailableUnderlyingAssetsProvider,
    IndexPricesProvider,
  ],
  evaluators: [
  ],
  services: [],
};

export default derivativesPlugin
