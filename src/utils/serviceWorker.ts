export const waitForActivation = (worker: ServiceWorker): Promise<void> => new Promise((resolve, reject) => {
  const check = () => {
    if (worker.state === 'activated' || worker.state === 'redundant') {
      worker.removeEventListener('statechange', check);
      if (worker.state === 'activated') resolve();
      else reject(new Error('No se pudo activar la actualización.'));
    }
  };
  worker.addEventListener('statechange', check);
  check();
});
