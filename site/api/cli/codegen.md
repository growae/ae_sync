# aesync codegen

Generate TypeScript type definitions for your configured contracts. Outputs an `aesync-env.d.ts` file with typed event interfaces.

## Usage

```bash
aesync codegen [options]
```

## Options

| Option | Default | Description |
|---|---|---|
| `--config <path>` | - | Path to config file |

## What It Does

1. Loads the config from `src/aesync.config.ts`
2. Compiles all contract ACIs
3. Generates `aesync-env.d.ts` with TypeScript type definitions for each contract's events
4. Closes the database connection and exits

## Output

```
◆ aesync codegen

✓ Generated aesync-env.d.ts (3 contracts)
```

## Generated Types

The generated `aesync-env.d.ts` file contains event type definitions derived from contract ACIs. These types provide autocomplete and type checking for event arguments in your handler functions.

## When to Use

- After adding or changing contracts in your config
- After updating a contract's ACI
- In CI/CD pipelines to verify types before deployment
- When you need fresh type definitions without starting the dev server

The `aesync dev` command runs codegen automatically on startup and on file changes, so you typically only need to run `codegen` manually in CI or when updating types without running the full dev server.

## Examples

```bash
# Generate types
aesync codegen

# With a custom config path
aesync codegen --config ./custom-config.ts
```
