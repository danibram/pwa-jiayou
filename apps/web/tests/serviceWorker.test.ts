import { describe, expect, it } from 'vitest';
import { waitForActivation } from '../src/utils/serviceWorker';

class Worker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  change(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

describe('service worker activation', () => {
  it('waits for activation and handles an already active worker', async () => {
    const worker = new Worker();
    const pending = waitForActivation(worker as unknown as ServiceWorker);
    worker.change('activated');
    await expect(pending).resolves.toBeUndefined();
    await expect(waitForActivation(worker as unknown as ServiceWorker)).resolves.toBeUndefined();
  });

  it('reports a worker that cannot activate', async () => {
    const worker = new Worker();
    const pending = waitForActivation(worker as unknown as ServiceWorker);
    worker.change('redundant');
    await expect(pending).rejects.toThrow();
  });
});
