import chrono from 'chrono-node';

export function parseReminder(text) {
  const results = chrono.parse(text);

  if (!results.length) return null;

  const date = results[0].start.date();
  const task = text.replace(results[0].text, '').trim();

  return {
    date,
    task: task || 'Напоминание',
  };
}