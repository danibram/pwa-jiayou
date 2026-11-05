import { cleanup, fireEvent, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../../src/App';
import Opciones from '../../../src/pages/Opciones';
import { createLearningSettings } from '../../../src/persistence/learningSettings';
import { createMemoryKeyValue } from '../../../src/persistence/keyValue';
import { LearningStorageError } from '../../../src/persistence/learning';
import type { LearningStore } from '../../../src/stores/learningStore';
import { renderWithStore, testLearningStore } from '../../fixtures/learningStore';

const stores: LearningStore[] = [];
afterEach(() => {
  cleanup();
  for (const store of stores.splice(0)) store.close();
});

describe('app start over the learning store', () => {
  it('shows an error with a retry when IndexedDB will not open, then opens Home', async () => {
    localStorage.setItem('hsk-installed-levels', '[1]');
    let failures = 1;
    const store = testLearningStore({
      repository: (create) => {
        const repo = create();
        const open = repo.open.bind(repo);
        repo.open = async () => {
          if (failures-- > 0) throw new LearningStorageError({ kind: 'unavailable', message: 'Simulated' });
          return open();
        };
        return repo;
      },
    });
    stores.push(store);
    renderWithStore(() => <App />, store);
    expect(await screen.findByText('No se puede abrir tu progreso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Aprender 10 palabras' })).toBeTruthy();
  });

  it('applies changed study settings to the next plan', async () => {
    localStorage.setItem('hsk-installed-levels', '[1]');
    const settings = createLearningSettings(createMemoryKeyValue());
    const store = testLearningStore({ settings: settings.sessionSettings });
    stores.push(store);
    await store.init();
    expect(store.previewPlan('today')?.counts.newItems).toBe(10);
    settings.update({ todayNewPerDay: 5 });
    expect(store.previewPlan('today')?.counts.newItems).toBe(5);
  });

  it('puts the study settings and the dev reset in Opciones', async () => {
    const store = testLearningStore();
    stores.push(store);
    renderWithStore(() => <Opciones onBack={() => {}} onManageLists={() => {}} />, store);
    expect(screen.getByRole('heading', { name: 'Estudio' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Copia de seguridad' })).toBeTruthy();
    // Vitest runs with the dev flag on, so the reset is offered.
    expect(screen.getByRole('button', { name: 'Reiniciar progreso de aprendizaje' })).toBeTruthy();
  });

  it('resets the learning log from Opciones and says so', async () => {
    localStorage.setItem('hsk-installed-levels', '[1]');
    const store = testLearningStore();
    stores.push(store);
    renderWithStore(() => <App />, store);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprender 10 palabras' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enséñamela' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(store.events()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Opciones/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso de aprendizaje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reiniciar' }));
    expect(await screen.findByText('Progreso de aprendizaje reiniciado.')).toBeTruthy();
    expect(store.events()).toHaveLength(0);
  });
});
