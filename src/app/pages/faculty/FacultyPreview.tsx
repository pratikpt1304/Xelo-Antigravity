import { useNavigate, useParams } from 'react-router-dom';
import { ErrorNote, Loading } from '../../../components/ui';
import { Workbench, type WorkbenchQuestion } from '../../../components/Workbench';
import { useLoad } from '../../../lib/hooks';
import type { CodeLang } from '../../../lib/logic/starters';
import { must, supabase } from '../../../lib/supabase';
import type { Course, QuestionRow, SessionQuestionRow, SessionRow } from '../../../lib/types';

export function FacultyPreview() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const { data, loading, error } = useLoad(async () => {
    if (!courseId) throw new Error('not_found');
    const [courseRes, sessRes, sqRes, qRes] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase.from('sessions').select('*').eq('course_id', courseId).order('n').limit(1),
      supabase.from('session_questions').select('*'),
      supabase.from('questions').select('*').eq('course_id', courseId),
    ]);
    return {
      course: must(courseRes) as Course,
      session: (must(sessRes) as SessionRow[])[0] ?? null,
      sqs: must(sqRes) as SessionQuestionRow[],
      questions: must(qRes) as QuestionRow[],
    };
  }, [courseId]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote message={error ?? 'Not found'} />;

  const wbQuestions: WorkbenchQuestion[] = (
    data.session
      ? data.questions.filter((q) =>
          data.sqs.some((sq) => sq.session_id === data.session?.id && sq.question_id === q.id),
        )
      : data.questions.slice(0, 2)
  ).map((q) => ({
    id: q.id,
    title: q.title,
    co_code: q.co_code,
    difficulty: q.difficulty,
    statement: q.statement,
    input_spec: q.input_spec,
    output_spec: q.output_spec,
    constraints: q.constraints,
    visibleTests: [
      { ord: 1, input: 'sample in', expected: 'sample out' },
      { ord: 2, input: 'sample in 2', expected: 'sample out 2' },
    ],
    hiddenCount: 3,
  }));

  return (
    <Workbench
      title={`${data.course.code} · Preview`}
      questions={
        wbQuestions.length
          ? wbQuestions
          : [
              {
                id: 'preview-1',
                title: 'Sample Preview Question',
                co_code: 'CO1',
                difficulty: 'medium',
                statement: 'Preview mode shows how students see the IDE.',
                input_spec: 'Two integers',
                output_spec: 'Their sum',
                constraints: '1 <= a, b <= 1000',
                visibleTests: [{ ord: 1, input: '2 3', expected: '5' }],
                hiddenCount: 3,
              },
            ]
      }
      allowedLangs={data.course.allowed_langs as CodeLang[]}
      preview
      onExit={() => navigate(`/faculty/c/${data.course.id}/sessions`)}
    />
  );
}
