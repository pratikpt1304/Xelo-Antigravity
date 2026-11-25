export interface AskAction {
  step: string;
  note: string;
}

export function parseAskCommand(input: string): AskAction | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  if (q.includes('setup') || q.includes('rubric') || q.includes('co')) {
    return { step: 'setup', note: 'Opened Course setup.' };
  }
  if (q.includes('batch') || q.includes('roster') || q.includes('code')) {
    return { step: 'batches', note: 'Opened Batches & roster.' };
  }
  if (q.includes('plan') || q.includes('calendar') || q.includes('holiday')) {
    return { step: 'sessions-plan', note: 'Opened Session plan.' };
  }
  if (q.includes('question') || q.includes('candidate')) {
    return { step: 'questions', note: 'Opened Lab questions.' };
  }
  if (q.includes('bank') || q.includes('mcq')) {
    return { step: 'banks', note: 'Opened Pre/post banks.' };
  }
  if (q.includes('session') || q.includes('today') || q.includes('live') || /s\d+/.test(q)) {
    return { step: 'sessions', note: 'Opened Sessions.' };
  }
  if (q.includes('class') || q.includes('week') || q.includes('task')) {
    return { step: 'classroom', note: 'Opened Classroom.' };
  }
  if (q.includes('end') || q.includes('exam') || q.includes('assess')) {
    return { step: 'assessments', note: 'Opened Assessments.' };
  }
  if (q.includes('report') || q.includes('course file') || q.includes('attainment')) {
    return { step: 'reports', note: 'Opened Reports.' };
  }
  return null;
}

export interface NextBestAction {
  id: string;
  text: string;
  cta: string;
  step: string;
}

export function nextBestActions(state: {
  planStatus: string;
  coCount: number;
  batchCount: number;
  sessionCount: number;
}): NextBestAction[] {
  const list: NextBestAction[] = [];
  if (state.coCount === 0) {
    list.push({
      id: 'add-co',
      text: 'Add course outcomes or draft them from your syllabus.',
      cta: 'Go to setup',
      step: 'setup',
    });
  } else if (state.planStatus === 'draft' || state.planStatus === 'declined') {
    list.push({
      id: 'send-plan',
      text:
        state.planStatus === 'declined'
          ? 'HOD returned the course plan. Review remark and re-submit.'
          : 'Course outcomes are ready. Send course plan to HOD for approval.',
      cta: 'Review & send',
      step: 'setup',
    });
  }
  if (state.batchCount === 0) {
    list.push({
      id: 'import-roster',
      text: 'Import your section roster to create batches and class codes.',
      cta: 'Open batches',
      step: 'batches',
    });
  }
  if (state.sessionCount === 0) {
    list.push({
      id: 'plan-sessions',
      text: 'Generate the 30-session lab calendar from term dates.',
      cta: 'Plan sessions',
      step: 'sessions-plan',
    });
  }
  return list;
}
