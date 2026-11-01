import { useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { QUESTS, QUEST_IDS, type QuestId } from '../data/balance';
import { questDone } from '../core/quests';
import { t, type MessageKey } from '../i18n/fr';
import type { GameStoreState } from '../store/gameStore';
import { QUEST_TARGET } from '../core/questTargets';
import { DESC_ROW_TODO, Dot, DotDescription, Modal, Portrait } from './common';
import { navigate } from './router';
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
  const name = t(`quest${id}` as MessageKey);
  const body = (
    <>
      <span className="quest-name">{name}</span>
      <span className="num meta">
        {t('questProgress', { a: p, b: def.goal })} ·{' '}
        <span aria-hidden="true">{t('questReward', { n: def.reward })}</span>
        <span className="visually-hidden">{t('questRewardLabel', { n: def.reward })}</span>
      </span>
      <progress max={def.goal} value={p} aria-hidden="true" />
    </>
  );
  // Patch 0.4.2 (1b, 1c): an unfinished quest is one native button to its activity; a
  // finished one is plain text, only « Réclamer » stays active.
  const go = () => {
    const target = QUEST_TARGET[id];
    if (target.kind === 'quiz') onQuiz();
    else navigate(target.route);
  };
  return (
    <li className="quest card">
      {!done ? (
        <button
          type="button"
          id={`quest-action-${id}`}
          className="quest-text quest-go"
          aria-describedby={DESC_ROW_TODO}
          onClick={go}
        >
          {body}
          <Dot />
        </button>
      ) : (
        <div className="quest-text">{body}</div>
      )}
      {claimed ? (
        <span className="claimed" id={`quest-action-${id}`} tabIndex={-1}>
          {t('claimed')}
        </span>
      ) : done ? (
        <button
          type="button"
          id={`quest-action-${id}`}
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
  const refocus = useRef(false);
  // DEF-GS-06: the quiz opens ON TOP of the quests dialog (closing it would unmount the quiz).
  // After the quiz, focus goes to the quiz row's action (its opener is replaced once answered).
  const closeQuiz = () => {
    refocus.current = true;
    setQuiz(false);
  };
  useEffect(() => {
    if (!quiz && refocus.current) {
      refocus.current = false;
      document.getElementById('quest-action-quiz')?.focus();
    }
  }, [quiz]);
  if (!has) return null;
  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          setQuiz(false);
          onClose();
        }}
        labelId="quests-title"
        initialFocusId="quests-title"
      >
        {/* Patch 0.4.2 (1a, D2): « Fermer » top right, sticky while the list scrolls. */}
        <div className="dlg-head">
          <h2 id="quests-title" tabIndex={-1}>
            {t('questsTitle')}
          </h2>
          <button type="button" className="btn btn-ghost dlg-close" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <ul className="quests">
          {QUEST_IDS.map((id) => (
            <QuestRow key={id} store={store} id={id} onQuiz={() => setQuiz(true)} />
          ))}
        </ul>
        <p className="meta">{t('noStreak')}</p>
        <DotDescription id={DESC_ROW_TODO} label={t('questRowTodo')} />
      </Modal>
      {open && quiz && <Quiz store={store} onClose={closeQuiz} />}
    </>
  );
}
