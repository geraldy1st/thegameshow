import { useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { QUESTS, QUEST_IDS, type QuestId } from '../data/balance';
import { questDone } from '../core/quests';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { Modal, Portrait } from './common';
import { todayQuestion } from './helpers';

type Store = StoreApi<GameStoreState>;

function Quiz({ store, onClose }: { store: Store; onClose: () => void }) {
  const g = useStore(store, (s) => s.game)!;
  const q = todayQuestion(g);
  const choice = g.quests.quizChoice;
  return (
    <Modal open onClose={onClose} labelId="quiz-title">
      <div className="quiz-head">
        <Portrait id="kyoko" alt="" className="portrait small" />
        <h2 id="quiz-title">{t('quizTitle')}</h2>
      </div>
      <p className="quiz-q">{q.q}</p>
      <div className="quiz-choices">
        {q.choices.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`btn btn-secondary ${choice !== null && i === q.answer ? 'right' : ''} ${choice === i && i !== q.answer ? 'wrong' : ''}`}
            aria-disabled={choice !== null}
            aria-pressed={choice === i}
            onClick={() => {
              if (choice === null) void store.getState().answerQuiz(i);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {choice !== null && (
        <div role="status" className="quiz-why">
          <p className="result">
            {choice === q.answer ? t('quizRight') : t('quizWrong', { a: q.choices[q.answer]! })}
          </p>
          <p>{q.why}</p>
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={onClose}>
        {t('close')}
      </button>
    </Modal>
  );
}

function QuestRow({ store, id, onQuiz }: { store: Store; id: QuestId; onQuiz: () => void }) {
  const g = useStore(store, (s) => s.game)!;
  const def = QUESTS[id];
  const p = Math.min(g.quests.progress[id], def.goal);
  const claimed = g.quests.claimed[id];
  const done = questDone(g, id);
  return (
    <li className="quest card">
      <div className="quest-text">
        <p className="quest-name">{t(`quest${id}` as MessageKey)}</p>
        <p className="num meta">
          {t('questProgress', { a: p, b: def.goal })} ·{' '}
          <span aria-hidden="true">{t('questReward', { n: def.reward })}</span>
          <span className="visually-hidden">{t('questRewardLabel', { n: def.reward })}</span>
        </p>
        <progress max={def.goal} value={p} aria-label={t(`quest${id}` as MessageKey)} />
      </div>
      {claimed ? (
        <span className="claimed">{t('claimed')}</span>
      ) : done ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void store
              .getState()
              .claimQuest(id)
              .then((ok) => ok && store.getState().announce(t('claimDone', { n: def.reward })))
          }
        >
          {t('claim')}
        </button>
      ) : id === 'quiz' ? (
        <button type="button" className="btn btn-secondary" onClick={onQuiz}>
          {t('quizOpen')}
        </button>
      ) : null}
    </li>
  );
}

export function Quests({
  store,
  open,
  onClose,
}: {
  store: Store;
  open: boolean;
  onClose: () => void;
}) {
  const [quiz, setQuiz] = useState(false);
  const has = useStore(store, (s) => s.game !== null);
  if (!has) return null;
  return (
    <>
      <Modal open={open && !quiz} onClose={onClose} labelId="quests-title">
        <h2 id="quests-title">{t('questsTitle')}</h2>
        <ul className="quests">
          {QUEST_IDS.map((id) => (
            <QuestRow key={id} store={store} id={id} onQuiz={() => setQuiz(true)} />
          ))}
        </ul>
        <p className="meta">{t('noStreak')}</p>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('close')}
        </button>
      </Modal>
      {open && quiz && <Quiz store={store} onClose={() => setQuiz(false)} />}
    </>
  );
}
