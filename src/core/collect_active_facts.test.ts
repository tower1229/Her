import { collectActiveFacts } from './collect_active_facts';

describe('collectActiveFacts', () => {
  const mockNow = '2026-03-31T14:00:00+08:00';

  it('collects an unexpired episode from the same day', async () => {
    const memoryGet = jest.fn(async (date) => {
      if (date === '2026-03-31') {
        return [
          '### [13:00:00]',
          '- Timestamp: 2026-03-31 13:00:00',
          '- Action: Working',
          '- Estimated_Duration: 120',
          '- Event_Id: evt-1'
        ].join('\n');
      }
      return '';
    });

    const facts = await collectActiveFacts(memoryGet, mockNow, 1);
    expect(facts).toHaveLength(1);
    expect(facts[0].event_id).toBe('evt-1');
    expect(facts[0].elapsed_minutes).toBe(60);
  });

  it('skips expired episodes from previous days', async () => {
    const memoryGet = jest.fn(async (date) => {
      if (date === '2026-03-30') {
        return [
          '### [08:00:00]',
          '- Timestamp: 2026-03-30 08:00:00',
          '- Action: Short task',
          '- Estimated_Duration: 30',
          '- Event_Id: evt-old'
        ].join('\n');
      }
      return '';
    });

    const facts = await collectActiveFacts(memoryGet, mockNow, 7);
    expect(facts).toHaveLength(0);
  });

  it('collects unexpired long-duration events across days (Lookback)', async () => {
    const memoryGet = jest.fn(async (date) => {
      if (date === '2026-03-30') {
        return [
          '### [12:00:00]',
          '- Timestamp: 2026-03-30 12:00:00',
          '- Action: Traveling',
          '- Estimated_Duration: 2880', // 48 hours
          '- Event_Id: evt-travel'
        ].join('\n');
      }
      return '';
    });

    const facts = await collectActiveFacts(memoryGet, mockNow, 7);
    expect(facts).toHaveLength(1);
    expect(facts[0].event_id).toBe('evt-travel');
    // From 03-30 12:00 to 03-31 14:00 is 24 + 2 = 26 hours = 1560 mins
    expect(facts[0].elapsed_minutes).toBe(1560);
  });

  it('sorts facts by descending timestamp (latest first)', async () => {
    const memoryGet = jest.fn(async (date) => {
      if (date === '2026-03-31') {
        return [
          '### [10:00:00]',
          '- Timestamp: 2026-03-31 10:00:00',
          '- Estimated_Duration: 300',
          '- Event_Id: evt-morning',
          '',
          '### [13:00:00]',
          '- Timestamp: 2026-03-31 13:00:00',
          '- Estimated_Duration: 120',
          '- Event_Id: evt-afternoon'
        ].join('\n');
      }
      return '';
    });

    const facts = await collectActiveFacts(memoryGet, mockNow, 1);
    expect(facts).toHaveLength(2);
    expect(facts[0].event_id).toBe('evt-afternoon');
    expect(facts[1].event_id).toBe('evt-morning');
  });
});
