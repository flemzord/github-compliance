export * from './checks';
export * from './config';
export * from './github';
export * from './reporting';
export * from './runner';

// Main entry point for GitHub Action
import { run } from './main-integrated';

if (require.main === module) {
  run();
}
