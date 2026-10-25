import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './ui/tokens.css';
import './ui/app.css';
import { ManualClock, systemClock, type Clock } from './core/clock';
import { openSaveDb } from './save/db';
import { createGameStore, randomSeed, webLocksWriter } from './store/gameStore';
import { App } from './ui/App';

async function boot() {
  let clock: Clock = systemClock;
  let seed = randomSeed;
  // Compile-time constant: in production this whole branch and the harness chunk are removed.
  if (import.meta.env.MODE === 'test-harness') {
    const params = new URLSearchParams(location.search);
    const manual = new ManualClock(Number(params.get('now')) || Date.now());
    const fixedSeed = Number(params.get('seed')) || 1;
    clock = manual;
    seed = () => fixedSeed;
    const { installTestHook } = await import('./testHarness');
    const store = createGameStore({
      clock,
      openDb: () => openSaveDb(),
      newSeed: seed,
      acquireWriterLock: webLocksWriter,
    });
    installTestHook(store, manual);
    return store;
  }
  return createGameStore({
    clock,
    openDb: () => openSaveDb(),
    newSeed: seed,
    acquireWriterLock: webLocksWriter,
  });
}

void boot().then((store) => {
  if ('storage' in navigator && navigator.storage.persist) void navigator.storage.persist(); // best effort only (RES-8)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
  void store.getState().init();
});
