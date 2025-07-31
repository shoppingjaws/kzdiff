import { diffLines } from "diff";
import chalk from "chalk";

export interface DiffOptions {
  color?: boolean;
  context?: number;
}

export function generateDiff(
  fromContent: string,
  toContent: string,
  fromLabel: string,
  toLabel: string,
  options: DiffOptions = {}
): string {
  const { color = true, context = 3 } = options;
  const changes = diffLines(fromContent, toContent);
  
  let output = "";
  
  // Add header
  if (color) {
    output += chalk.cyan(`--- ${fromLabel}\n`);
    output += chalk.cyan(`+++ ${toLabel}\n`);
  } else {
    output += `--- ${fromLabel}\n`;
    output += `+++ ${toLabel}\n`;
  }
  
  // Process changes
  changes.forEach((part) => {
    const lines = part.value.split('\n').filter(line => line); // Remove empty lines
    
    if (part.added) {
      lines.forEach(line => {
        if (color) {
          output += chalk.green(`+ ${line}\n`);
        } else {
          output += `+ ${line}\n`;
        }
      });
    } else if (part.removed) {
      lines.forEach(line => {
        if (color) {
          output += chalk.red(`- ${line}\n`);
        } else {
          output += `- ${line}\n`;
        }
      });
    } else {
      // Context lines
      if (context > 0) {
        const contextLines = lines.slice(0, context);
        contextLines.forEach(line => {
          if (color) {
            output += chalk.gray(`  ${line}\n`);
          } else {
            output += `  ${line}\n`;
          }
        });
      }
    }
  });
  
  return output;
}

export function formatYamlDiff(
  fromYaml: string,
  toYaml: string,
  fromLabel: string,
  toLabel: string,
  options: DiffOptions = {}
): string {
  // Sort YAML lines to group related changes together
  const sortYamlLines = (yaml: string): string => {
    // This is a simple implementation. For production, consider using a YAML parser
    return yaml.split('\n').sort().join('\n');
  };
  
  // For now, use simple line diff
  // TODO: Implement structured YAML diff that understands YAML structure
  return generateDiff(fromYaml, toYaml, fromLabel, toLabel, options);
}