# ae-sync codegen

Generate TypeScript type definitions for your configured contracts. Outputs an `ae-sync-env.d.ts` file with typed event interfaces.

## Usage

```bash
ae-sync codegen [options]
```

## Options

| Option | Default | Description |
|---|---|---|
| `--config <path>` | - | Path to config file |

## What It Does

1. Loads the config from `src/ae-sync.config.ts`
2. Compiles all contract ACIs
3. Generates `ae-sync-env.d.ts` with TypeScript type definitions for each contract's events
4. Closes the database connection and exits

## Output

```
◆ ae-sync codegen

✓ Generated ae-sync-env.d.ts (3 contracts)
```

## Generated Types

The generated `ae-sync-env.d.ts` file contains event type definitions derived from contract ACIs. These types provide autocomplete and type checking for event arguments in your handler functions.

## When to Use

- After adding or changing contracts in your config
- After updating a contract's ACI
- In CI/CD pipelines to verify types before deployment
- When you need fresh type definitions without starting the dev server

The `ae-sync dev` command runs codegen automatically on startup and on file changes, so you typically only need to run `codegen` manually in CI or when updating types without running the full dev server.

## Examples

```bash
# Generate types
ae-sync codegen

# With a custom config path
ae-sync codegen --config ./custom-config.ts
```
