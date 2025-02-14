import readline from "readline";
import { elizaLogger } from "@elizaos/core";

export type IterationMode = 'sleep' | 'manual';

export class TraderCLI {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on("SIGINT", () => {
      this.rl.close();
      process.exit(0);
    });
  }

  async waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(
        "\nPress Enter to execute next iteration, or type 'exit' to stop: ",
        (input) => {
          if (input.toLowerCase() === "exit") {
            this.rl.close();
            process.exit(0);
          }
          resolve(true);
        }
      );
    });
  }

  close(): void {
    this.rl.close();
  }
}

export async function waitForNextIteration(mode: IterationMode, interval: number = 5000): Promise<void> {
  if (mode === 'manual') {
    const cli = new TraderCLI();
    elizaLogger.info('Manual mode: Waiting for user approval...');
    await cli.waitForApproval();
    cli.close();
  } else {
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
