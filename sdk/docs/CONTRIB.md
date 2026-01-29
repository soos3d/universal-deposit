# Contributing Guide

## Development Setup

### Prerequisites
- Node.js v18+
- npm or yarn

### Installation
```bash
npm install
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `npm run build` | Build ESM + CJS + types to `dist/` using tsup |
| `dev` | `npm run dev` | Development mode with watch for file changes |
| `typecheck` | `npm run typecheck` | Run TypeScript type checking without emitting |
| `test` | `npm run test` | Run all unit tests with vitest |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `test:integration` | `npm run test:integration` | Run integration tests (real API calls) |

## Development Workflow

1. **Start development mode**
   ```bash
   npm run dev
   ```

2. **Run tests while developing**
   ```bash
   npm run test:watch
   ```

3. **Before committing**
   ```bash
   npm run typecheck
   npm run test
   npm run build
   ```

## Testing

### Unit Tests
Unit tests mock external dependencies:
```bash
npm run test
```

### Integration Tests
Integration tests make real API calls to the JWT worker:
```bash
npm run test:integration
```

Test files are located in:
- `src/__tests__/*.test.ts` - Unit tests
- `src/__tests__/integration/*.test.ts` - Integration tests

## Package Exports

The SDK provides three entry points:

| Export | Description |
|--------|-------------|
| `@particle-network/deposit-sdk` | Core client, types, errors, constants |
| `@particle-network/deposit-sdk/react` | React provider, hooks, components |
| `@particle-network/deposit-sdk/react/auth-core` | Direct Auth Core re-exports |

## Code Style

- TypeScript strict mode
- Immutable patterns (no mutations)
- Small, focused files (< 400 lines)
- Comprehensive error handling

## Pull Request Process

1. Create feature branch from `main`
2. Write tests first (TDD)
3. Implement changes
4. Run full test suite
5. Update documentation if needed
6. Submit PR with clear description
