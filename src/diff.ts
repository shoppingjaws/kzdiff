import { $ } from "bun";
import { readFile } from "node:fs/promises";
import { createDebugLogger } from "./debug";

const debug = createDebugLogger("diff");

export interface DiffOptions {
  tool?: "diff" | "git-diff" | "delta" | "colordiff";
  color?: boolean;
  context?: number;
}

export async function showDiff(
  file1: string,
  file2: string,
  options: DiffOptions = {}
): Promise<void> {
  const { tool = "diff", color = true, context = 3 } = options;
  
  debug(`Comparing ${file1} vs ${file2} using ${tool}`);
  
  try {
    switch (tool) {
      case "diff": {
        const args = ["diff", `-u${context}`];
        if (color) {
          args.push("--color=always");
        }
        args.push(file1, file2);
        
        const result = await $`${args}`.nothrow();
        
        if (result.exitCode === 0) {
          console.log("No differences found.");
        } else if (result.exitCode === 1) {
          // diff returns 1 when files differ, which is expected
          console.log(result.stdout.toString());
        } else {
          // Try without color if --color is not supported
          if (color) {
            debug("Retrying without color option");
            const fallbackResult = await $`diff -u${context} ${file1} ${file2}`.nothrow();
            if (fallbackResult.exitCode === 1) {
              console.log(fallbackResult.stdout.toString());
            } else {
              throw new Error(`diff failed: ${result.stderr.toString()}`);
            }
          } else {
            throw new Error(`diff failed: ${result.stderr.toString()}`);
          }
        }
        break;
      }
      
      case "git-diff": {
        // Use git diff for better colored output
        const result = await $`git diff --no-index --no-prefix --color=${color ? "always" : "never"} -U${context} ${file1} ${file2}`.nothrow();
        
        if (result.exitCode === 0) {
          console.log("No differences found.");
        } else if (result.exitCode === 1) {
          console.log(result.stdout.toString());
        } else {
          throw new Error(`git diff failed: ${result.stderr.toString()}`);
        }
        break;
      }
      
      case "colordiff": {
        // Try colordiff if available
        const result = await $`colordiff -u${context} ${file1} ${file2}`.nothrow();
        
        if (result.exitCode === 0) {
          console.log("No differences found.");
        } else if (result.exitCode === 1) {
          console.log(result.stdout.toString());
        } else {
          // Fallback to regular diff
          debug("colordiff not available, falling back to diff");
          await showDiff(file1, file2, { ...options, tool: "diff" });
        }
        break;
      }
      
      case "delta": {
        // Try delta if available
        const result = await $`delta ${file1} ${file2}`.nothrow();
        
        if (result.exitCode === 0 || result.exitCode === 1) {
          console.log(result.stdout.toString());
        } else if (result.stderr.toString().includes("command not found")) {
          // Fallback to regular diff
          debug("delta not available, falling back to diff");
          await showDiff(file1, file2, { ...options, tool: "diff" });
        } else {
          throw new Error(`delta failed: ${result.stderr.toString()}`);
        }
        break;
      }
      
      default:
        throw new Error(`Unknown diff tool: ${tool}`);
    }
  } catch (error) {
    console.error("Failed to run diff:", error);
    // Fallback: show file contents
    console.log("\n--- File 1 ---");
    console.log(await readFile(file1, "utf-8"));
    console.log("\n--- File 2 ---");
    console.log(await readFile(file2, "utf-8"));
  }
}