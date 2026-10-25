import { useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import {
  FRIEND_IDS,
  MAX_AFFINITY,
  SCENE_THRESHOLDS,
  VISITS_COUNTED_PER_DAY,
  type FriendId,
} from '../data/balance';
import { SCENE1 } from '../data/friends';
import { unlockedScenes } from '../core/quests';
import { t } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Modal, Portrait } from './common';
import { displayName } from './helpers';

type Store = StoreApi<GameStoreState>;

function Scene({ store, id, onClose }: { store: Store; id: FriendId; onClose: () => void }) {
  const [i, setI] = useState(0);
  const lines = SCENE1[id];
  const last = i === lines.length - 1;
  return (
    <Modal open onClose={onClose} labelId="scene-title">
      <div className="quiz-head">
        <Portrait id={id} alt="" className="portrait small" />
        <h2 id="scene-title">{displayName(id)}</h2>
      </div>
      <p className="dialogue" aria-live="polite">
        {lines[i]}
      </p>
      <p className="meta num">
        {i + 1} / {lines.length}
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          if (!last) return setI(i + 1);
          void store.getState().seeScene(id, 1);
          onClose();
        }}
      >
        {last ? t('sceneEnd') : t('sceneNext')}
      </button>
    </Modal>
  );
}

function FriendCard({ store, id, onScene }: { store: Store; id: FriendId; onScene: () => void }) {
  const f = useStore(store, (s) => s.game!.friends[id]);
  const scene1 = useStore(store, (s) => unlockedScenes(s.game!, id).includes(1));
  const readonly = useStore(store, (s) => s.status !== 'ready');
  const name = displayName(id);
  return (
    <li className="friend card">
      <Portrait id={id} alt="" className="portrait" />
      <div className="friend-body">
        <h3>{name}</h3>
        <p className="num">{t('affinity', { n: f.affinity })}</p>
        <progress
          max={MAX_AFFINITY}
          value={f.affinity}
          aria-label={t('affinity', { n: f.affinity })}
        />
        <p className="meta num">
          {t('visitsLeft', {
            a: Math.min(f.visitsToday, VISITS_COUNTED_PER_DAY),
            b: VISITS_COUNTED_PER_DAY,
          })}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          aria-disabled={readonly}
          onClick={() => {
            if (readonly) return;
            void store
              .getState()
              .visit(id)
              .then(
                (r) =>
                  r &&
                  store
                    .getState()
                    .announce(r.counted ? t('hangDone', { name }) : t('hangNoGain', { name })),
              );
          }}
        >
          {t('hang', { name })}
        </button>
        {scene1 ? (
          <button type="button" className="btn btn-ghost" onClick={onScene}>
            {t('sceneOpen')}
          </button>
        ) : (
          <p className="meta">{t('sceneLocked', { n: SCENE_THRESHOLDS[0] })}</p>
        )}
      </div>
    </li>
  );
}

export function Friends({ store }: { store: Store }) {
  const [scene, setScene] = useState<FriendId | null>(null);
  return (
    <section aria-labelledby="friends-title">
      <h2 id="friends-title">{t('friendsTitle')}</h2>
      <ul className="friends">
        {FRIEND_IDS.map((id) => (
          <FriendCard key={id} store={store} id={id} onScene={() => setScene(id)} />
        ))}
      </ul>
      <p className="meta">{t('sceneSoon')}</p>
      {scene && <Scene store={store} id={scene} onClose={() => setScene(null)} />}
    </section>
  );
}
