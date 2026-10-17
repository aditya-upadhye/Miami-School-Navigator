import Card, { h2 } from '../../components/Card';
import { useI18n } from '../../i18n';

export default function QuestionsToAsk({ questions }) {
  const { t } = useI18n();
  return (
    <Card aria-labelledby="ask-title">
      <h2 id="ask-title" style={h2}>
        {t('school.ask.title')}
      </h2>
      <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('school.ask.intro')}</p>
      <ul
        style={{
          margin: 0,
          paddingLeft: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 16,
          lineHeight: 1.45,
        }}
      >
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </Card>
  );
}
