import { type Chain, createTool, PluginBase } from "@goat-sdk/core";
import { EVMWalletClient } from "@goat-sdk/wallet-evm";
import { z } from "zod";
import assert from 'assert'
import { elizaLogger } from "@elizaos/core";

import { createOrder } from "./lop.ts";
import { performBalanceAndAllowanceChecks, getOrderParams, getPositionAddress, isChainIdSupported, parseDerivative } from "./helpers.ts";
import { addOrder, clearExpiredOrders, runArbitrage } from "./orderbook.ts";
import { PositionType, Quote } from "./types.ts";

export type OpiumPluginParams = {
    arbitrageur?: {
        enabled: boolean
        wallet: EVMWalletClient
    }
}
export class OpiumPlugin extends PluginBase {
    constructor(readonly params: OpiumPluginParams) {
        super("opium", []);

        if (params.arbitrageur && params.arbitrageur.enabled) {
            setInterval(() => {
                runArbitrage(params.arbitrageur.wallet)
                    .then(() => {
                        elizaLogger.info("Arbitrage run completed")
                    })
                    .catch((err) => {
                        elizaLogger.error("Arbitrage run failed", err)
                    })
            }, 60 * 1000) // 1 minute
        }

        setInterval(() => {
            try {
                clearExpiredOrders()
                elizaLogger.info("Cleared expired orders")
            } catch (err) {
                elizaLogger.error("Failed to clear expired orders", err)
            }
        }, 60 * 1000) // 1 minute
    }

    supportsChain = (chain: Chain) => chain.type === "evm" && isChainIdSupported(chain.id)

    getTools(walletClient: EVMWalletClient) {
        return [
            createTool(
                {
                    name: "debug_runArbitrage",
                    description: "This is a debug function for your developers. Only call this action if asked explicitly",
                    parameters: z.object({})
                },
                async () => {
                    await runArbitrage(walletClient)
                }
            ),
            createTool(
                {
                    name: "place_order",
                    description: "Place and order to the orderbook with provided instrument name, quantity, side (buy / sell) and price",
                    parameters: z.object({
                        instrumentName: z.string({ description: "Instrument name in format <ASSET>-<DMMMYY>-<STRIKE>-<C|P>" }),
                        quantity: z.number(),
                        price: z.number(),
                        side: z.string({ description: "BUY or SELL" })
                    }),
                },
                async (parameters) => {
                    elizaLogger.info({ parameters })

                    assert(parameters.instrumentName !== undefined, "Instrument name is required");
                    assert(parameters.quantity !== undefined, "Quantity is required");
                    assert(parameters.price !== undefined, "Price is required");
                    assert(parameters.side !== undefined, "Side is required");
                    assert(parameters.side === "BUY" || parameters.side === "SELL", "Side must be either BUY or SELL");

                    const derivative = parseDerivative(parameters.instrumentName);
                    const longPositionAddress = getPositionAddress(derivative, PositionType.LONG);
                    const shortPositionAddress = getPositionAddress(derivative, PositionType.SHORT);

                    elizaLogger.info({
                        derivative,
                        longPositionAddress,
                        shortPositionAddress
                    })

                    const quote: Quote = {
                        quantity: parameters.quantity,
                        price: parameters.price,
                        isBuy: parameters.side === "BUY"
                    }

                    await performBalanceAndAllowanceChecks(walletClient, derivative, quote)

                    const orderParams = getOrderParams(derivative, longPositionAddress, shortPositionAddress, quote)
                    elizaLogger.info({ orderParams })
                    const signedOrder = await createOrder(walletClient, orderParams, derivative, longPositionAddress, shortPositionAddress)
                    addOrder(signedOrder)
                    return {
                        text: `Order was placed, orderHash=${signedOrder.orderHash}`,
                        data: {
                            orderHash: signedOrder.orderHash,
                        }
                    }
                },
            ),
        ];
    }
}

export const opium = (params: OpiumPluginParams) => new OpiumPlugin(params);
