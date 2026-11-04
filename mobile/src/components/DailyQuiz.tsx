import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { auth } from '@/config/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useGame } from '@/context/GameContext';
import { Badge, Button, Card, CardTitle, Copy, Eyebrow, Notice } from '@/components/ui/kit';

interface Quiz {
  worldId: string;
  revision: number;
  date: string;
  question: { id: string; prompt: string; options: string[] };
  answer: null | { answerIndex: number; correct: boolean; correctIndex: number; explanation: string; answeredAt: string };
}

export function DailyQuiz() {
  const { user } = useAuth();
  const { world } = useGame();
  if (!user || !world) return null;
  if (world.status === 'advancing') return <Card style={{ gap: 12 }}><Eyebrow>The daily question</Eyebrow><Copy muted>The game clock is moving. Your question will update when it finishes.</Copy></Card>;
  return <QuizCard key={`${user.uid}/${world.id}/${world.revision}`} uid={user.uid} worldId={world.id} revision={world.revision} />;
}

function QuizCard({ uid, worldId, revision }: { uid: string; worldId: string; revision: number }) {
  const { palette } = useTheme();
  const { refreshWorld } = useGame();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const requestNumber = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const result = await api<Quiz>('/daily-quiz');
      if (!active.current || request !== requestNumber.current || auth?.currentUser?.uid !== uid) return;
      if (result.worldId !== worldId || result.revision !== revision) {
        throw new ApiError('WORLD_CHANGED', 'The game clock changed. Refreshing today’s question.', 409);
      }
      setQuiz(result);
      setSelected(result.answer?.answerIndex ?? null);
      setError(null);
    } catch (cause) {
      if (active.current && request === requestNumber.current && auth?.currentUser?.uid === uid) {
        setError(errorMessage(cause));
        if (cause instanceof ApiError && ['WORLD_CHANGED', 'WORLD_ADVANCING'].includes(cause.code)) await refreshWorld();
      }
    } finally {
      if (active.current && request === requestNumber.current) setLoading(false);
    }
  }, [uid, worldId, revision, refreshWorld]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active.current = false; requestNumber.current += 1; subscription.remove(); };
  }, [refresh]));

  async function submit() {
    if (!quiz || selected === null || quiz.answer || submitting || loading) return;
    const current = quiz;
    const request = ++requestNumber.current;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<Quiz>('/daily-quiz/answer', { method: 'POST', body: { worldId: current.worldId, date: current.date, questionId: current.question.id, answerIndex: selected } });
      if (!active.current || request !== requestNumber.current || auth?.currentUser?.uid !== uid) return;
      setQuiz(result);
      setSelected(result.answer?.answerIndex ?? null);
    } catch (cause) {
      if (!active.current || request !== requestNumber.current || auth?.currentUser?.uid !== uid) return;
      if (cause instanceof ApiError && ['QUIZ_EXPIRED', 'WORLD_ADVANCING'].includes(cause.code)) { await refreshWorld(); await refresh(); }
      else setError(errorMessage(cause));
    } finally {
      if (auth?.currentUser?.uid === uid) setSubmitting(false);
    }
  }

  return <Card style={{ gap: 18 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <Eyebrow>The daily question</Eyebrow>{quiz && <Badge>Game day · {quiz.date}</Badge>}
    </View>
    <CardTitle>One question. A little more confidence.</CardTitle>
    <Copy muted>A different financial question appears each game day. Everyone gets the same question, and your first answer is final. There is no cash or ranking bonus.</Copy>
    {loading && !quiz && <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><ActivityIndicator color={palette.green} /><Copy muted>Loading today’s question…</Copy></View>}
    {error && <Notice tone="error" action={<Button compact variant="secondary" loading={loading} onPress={() => { void refresh(); }}>Refresh question</Button>}>{error}</Notice>}
    {quiz && <>
      <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, fontWeight: '600', lineHeight: 29 }}>{quiz.question.prompt}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Daily quiz answers" style={{ gap: 10 }}>
        {quiz.question.options.map((option, index) => {
          const chosen = selected === index;
          const correct = quiz.answer?.correctIndex === index;
          const incorrect = Boolean(quiz.answer && chosen && !correct);
          const border = correct ? palette.green : incorrect ? palette.red : chosen ? palette.green : palette.line;
          return <Pressable key={`${quiz.question.id}-${index}`} accessibilityRole="radio" accessibilityLabel={`${String.fromCharCode(65 + index)}. ${option}`}
            accessibilityState={{ checked: chosen, disabled: Boolean(quiz.answer) || submitting || loading }}
            disabled={Boolean(quiz.answer) || submitting || loading} onPress={() => setSelected(index)}
            style={({ pressed }) => ({ borderWidth: 1, borderColor: border, borderRadius: 10, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: correct ? palette.mint : incorrect ? palette.redBg : chosen ? palette.soft : palette.paper, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, color: incorrect ? palette.red : palette.ink, fontWeight: '700' }}>{String.fromCharCode(65 + index)}</Text></View>
            <Text style={{ flex: 1, color: palette.ink, fontSize: 14, lineHeight: 22 }}>{option}</Text>
          </Pressable>;
        })}
      </View>
      {quiz.answer ? <View style={{ gap: 12 }}>
        <Badge tone={quiz.answer.correct ? 'positive' : 'neutral'}>{quiz.answer.correct ? 'Correct answer' : 'A useful lesson'}</Badge>
        <Notice tone={quiz.answer.correct ? 'success' : 'neutral'}>{quiz.answer.explanation}</Notice>
        <Copy muted>Your answer is saved for this game day. The next question appears when the game advances to another day.</Copy>
      </View> : <View style={{ gap: 10, alignItems: 'flex-start' }}>
        <Button disabled={selected === null || loading} loading={submitting} onPress={() => { void submit(); }}>Check my answer</Button>
      </View>}
    </>}
  </Card>;
}
