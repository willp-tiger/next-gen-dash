import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Build & Project Health', () => {
  it('client Vite build succeeds', () => {
    const result = execSync('npm run build --workspace=client', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(result).toContain('built in');
  });

  it('client dist directory contains index.html', () => {
    const indexPath = path.join(ROOT, 'client', 'dist', 'index.html');
    expect(fs.existsSync(indexPath)).toBe(true);
  });

  it('client dist contains JS and CSS assets', () => {
    const assetsDir = path.join(ROOT, 'client', 'dist', 'assets');
    expect(fs.existsSync(assetsDir)).toBe(true);
    const files = fs.readdirSync(assetsDir);
    expect(files.some((f) => f.endsWith('.js'))).toBe(true);
    expect(files.some((f) => f.endsWith('.css'))).toBe(true);
  });

  it('Dockerfile exists and references correct paths', () => {
    const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(dockerfile).toContain('client/dist');
    expect(dockerfile).toContain('EXPOSE');
    expect(dockerfile).toContain('NODE_ENV=production');
  });

  it('.env.example exists with ANTHROPIC_API_KEY', () => {
    const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    expect(envExample).toContain('ANTHROPIC_API_KEY');
  });

  it('.gitignore excludes node_modules and .env', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.env');
  });

  it('all required source files exist', () => {
    const requiredFiles = [
      'shared/types.ts',
      'server/src/index.ts',
      'server/src/services/mockData.ts',
      'server/src/services/claude.ts',
      'server/src/services/configStore.ts',
      'server/src/prompts/interpret.ts',
      'server/src/prompts/refine.ts',
      'server/src/routes/interpret.ts',
      'server/src/routes/dashboard.ts',
      'server/src/routes/metrics.ts',
      'server/src/routes/refinement.ts',
      'client/src/App.tsx',
      'client/src/main.tsx',
      'client/src/api/client.ts',
      'client/src/components/onboarding/OnboardingFlow.tsx',
      'client/src/components/interpretation/InterpretationReview.tsx',
      'client/src/components/dashboard/Dashboard.tsx',
      'client/src/components/dashboard/MetricTile.tsx',
      'client/src/components/dashboard/ChartTile.tsx',
      'client/src/components/dashboard/HealthBadge.tsx',
      'client/src/components/dashboard/ViewToggle.tsx',
      'client/src/components/refinement/RefinementBanner.tsx',
      'client/src/components/layout/Header.tsx',
    ];

    for (const file of requiredFiles) {
      expect(fs.existsSync(path.join(ROOT, file)), `Missing: ${file}`).toBe(true);
    }
  });
});
