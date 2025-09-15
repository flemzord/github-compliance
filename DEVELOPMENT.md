# Development Guide

## 🔧 Development Commands

### Linting (Code Quality)

```bash
# Run complete lint check (Style + Types + Unused code)
npm run lint

# Auto-fix what can be fixed automatically
npm run lint:fix
```

**What `npm run lint` includes:**
- **Style & Syntax** (`lint:biome`) - Code formatting, imports, best practices
- **Unused Code** (`lint:knip`) - Dead code detection, unused exports/dependencies
- **Type Safety** (`lint:types`) - TypeScript type checking

### Individual Lint Commands

```bash
# Style and syntax only
npm run lint:biome
npm run lint:biome:fix

# Unused code detection only
npm run lint:knip
npm run lint:knip:fix

# TypeScript type checking only
npm run lint:types

# Format code only
npm run format
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Building

```bash
# Build for production
npm run build

# Build and watch for changes
npm run build:watch

# Run in development mode
npm run dev
```

## 🚀 Recommended Workflow

1. **Before committing:**
   ```bash
   npm run lint:fix
   npm test
   ```

2. **CI/CD should run:**
   ```bash
   npm run lint
   npm test
   npm run build
   ```

## 🔍 Understanding the Difference

- **BiomeJS** = Code style, formatting, syntax rules
- **Knip** = Dead code elimination, unused dependencies
- **TypeScript** = Type safety, interface validation
- **Jest** = Unit tests, logic validation

All together = **Complete code quality assurance** 🎯