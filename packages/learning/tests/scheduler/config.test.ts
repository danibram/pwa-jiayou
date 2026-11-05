import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DefaultScheduler } from 'ts-fsrs';
import {
  configId,
  createScheduler,
  createSchedulerRegistry,
  DEFAULT_SCHEDULER_CONFIG,
  INSTALLED_TS_FSRS_VERSION,
  InvalidSchedulerConfigError,
  validateSchedulerConfig,
} from '../../../src/domain/learning/scheduler';
import type { SchedulerConfig } from '../../../src/domain/learning/types';

const withChange = (change: Record<string, unknown>) => ({ ...DEFAULT_SCHEDULER_CONFIG, ...change }) as SchedulerConfig;

describe('scheduler config', () => {
  it('pins the installed ts-fsrs version', () => {
    const installed = JSON.parse(readFileSync(['node_modules/ts-fsrs/package.json', '../../node_modules/ts-fsrs/package.json'].find((path) => existsSync(path))!, 'utf8')) as { version: string };
    expect(INSTALLED_TS_FSRS_VERSION).toBe(installed.version);
    expect(DEFAULT_SCHEDULER_CONFIG.packageVersion).toBe(installed.version);
  });

  it('matches the library defaults for FSRS-7 with 0.9 retention', async () => {
    const library = await DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableFuzz: false });
    const ours = await createScheduler(DEFAULT_SCHEDULER_CONFIG);
    expect(ours.config.parameters).toEqual(library.config.weights);
    expect(library.config).toMatchObject({
      maximumInterval: DEFAULT_SCHEDULER_CONFIG.maximumIntervalDays,
      enableShortTerm: DEFAULT_SCHEDULER_CONFIG.enableShortTerm,
      learningSteps: DEFAULT_SCHEDULER_CONFIG.learningSteps,
      relearningSteps: DEFAULT_SCHEDULER_CONFIG.relearningSteps,
      graduatingInterval: DEFAULT_SCHEDULER_CONFIG.graduatingInterval,
      clearStatsOnForget: DEFAULT_SCHEDULER_CONFIG.clearStatsOnForget,
      allowModelOverride: DEFAULT_SCHEDULER_CONFIG.allowModelOverride,
      fractionalDays: true,
      enableFuzz: false,
    });
  });

  it.each([
    ['33 parameters', { parameters: DEFAULT_SCHEDULER_CONFIG.parameters.slice(1) }, '34 parameters'],
    ['a NaN parameter', { parameters: [Number.NaN, ...DEFAULT_SCHEDULER_CONFIG.parameters.slice(1)] }, 'finite'],
    ['another package version', { packageVersion: '6.0.1' }, 'installed is 6.0.0'],
    ['another model', { modelVersion: 'FSRS-6' }, 'Unsupported model'],
    ['another algorithm', { algorithm: 'sm2' }, 'Unsupported algorithm'],
    ['fuzz on', { enableFuzz: true }, 'enableFuzz'],
    ['integer days', { fractionalDays: false }, 'fractional days'],
    ['retention of 1', { desiredRetention: 1 }, 'desiredRetention'],
    ['a step in seconds', { learningSteps: ['30s'] }, 'learningSteps'],
    ['a fractional maximum interval', { maximumIntervalDays: 1.5 }, 'maximumIntervalDays'],
  ])('rejects %s', async (_label, change, message) => {
    const config = withChange(change);
    expect(() => validateSchedulerConfig(config)).toThrow(message);
    await expect(createScheduler(config)).rejects.toBeInstanceOf(InvalidSchedulerConfigError);
  });

  it('accepts the default config', () => {
    expect(() => validateSchedulerConfig(DEFAULT_SCHEDULER_CONFIG)).not.toThrow();
  });

  it('hashes the canonical JSON, whatever the key order', async () => {
    const reversed = Object.fromEntries(Object.entries(DEFAULT_SCHEDULER_CONFIG).reverse()) as unknown as SchedulerConfig;
    const id = await configId(DEFAULT_SCHEDULER_CONFIG);
    expect(id).toMatch(/^scheduler-config:sha256:[0-9a-f]{64}$/);
    expect(await configId(reversed)).toBe(id);
    expect(await configId({ ...DEFAULT_SCHEDULER_CONFIG, extra: undefined } as SchedulerConfig)).toBe(id);
    expect(await configId(withChange({ desiredRetention: 0.85 }))).not.toBe(id);
    expect((await createScheduler(reversed)).configId).toBe(id);
  });

  it('keeps the default config id stable', async () => {
    // Changing it orphans every stored review: a new config is a new id on purpose.
    expect(await configId(DEFAULT_SCHEDULER_CONFIG)).toMatchInlineSnapshot(`"scheduler-config:sha256:b55c0ecf74c44b8be2fab9a3a97e4b5f765edf7f5f3538b95b587adb785cff19"`);
  });

  it('keeps its own copy of the config', async () => {
    const parameters = [...DEFAULT_SCHEDULER_CONFIG.parameters];
    const scheduler = await createScheduler({ ...DEFAULT_SCHEDULER_CONFIG, parameters });
    parameters[0] = 9;
    expect(scheduler.config.parameters[0]).toBe(DEFAULT_SCHEDULER_CONFIG.parameters[0]);
  });

  it('builds a registry only from configs stored under their own id', async () => {
    const id = await configId(DEFAULT_SCHEDULER_CONFIG);
    const registry = await createSchedulerRegistry([{ id, config: DEFAULT_SCHEDULER_CONFIG }]);
    expect(registry.get(id)?.configId).toBe(id);
    const other = await configId(withChange({ desiredRetention: 0.85 }));
    await expect(createSchedulerRegistry([{ id: other, config: DEFAULT_SCHEDULER_CONFIG }])).rejects.toThrow('hashes to');
    const twice = [{ id, config: DEFAULT_SCHEDULER_CONFIG }, { id, config: withChange({ desiredRetention: 0.85 }) }];
    await expect(createSchedulerRegistry(twice)).rejects.toThrow('Two configs stored as');
  });
});
