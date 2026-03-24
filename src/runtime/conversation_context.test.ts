import { buildConversationContextFromMessages } from './conversation_context';

describe('buildConversationContextFromMessages', () => {
  it('prefers conversation continuity for now queries inside the stickiness window', () => {
    const context = buildConversationContextFromMessages(
      [
        {
          role: 'user',
          bodyText: '我们刚才在聊 timeline 的现实逻辑',
          createdAt: '2026-03-24T10:02:00+08:00',
        },
        {
          role: 'assistant',
          bodyText: '我现在正在把会话粘连窗口也纳入设计里。',
          createdAt: '2026-03-24T10:04:00+08:00',
        },
      ],
      '2026-03-24T10:08:00+08:00',
      { query: '你在干嘛啊' },
      10,
      'now',
    );

    expect(context.is_recently_active).toBe(true);
    expect(context.minutes_since_last_turn).toBe(4);
    expect(context.should_prefer_conversation_continuity_for_now).toBe(true);
    expect(context.active_topic_summary).toContain('timeline');
  });

  it('does not prefer conversation continuity once the stickiness window has passed', () => {
    const context = buildConversationContextFromMessages(
      [
        {
          role: 'user',
          bodyText: '上午我们在讨论插件文档',
          createdAt: '2026-03-24T10:00:00+08:00',
        },
      ],
      '2026-03-24T10:25:00+08:00',
      { query: '你在干嘛啊' },
      10,
      'now',
    );

    expect(context.is_recently_active).toBe(false);
    expect(context.minutes_since_last_turn).toBe(25);
    expect(context.should_prefer_conversation_continuity_for_now).toBe(false);
  });

  it('understands nested OpenClaw session envelopes with message.role and message.timestamp', () => {
    const context = buildConversationContextFromMessages(
      [
        {
          type: 'message',
          timestamp: '2026-03-24T08:21:22.939Z',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '刚才还在和你继续讨论 timeline。' }],
            timestamp: 1774340482930,
          },
        },
      ],
      '2026-03-24T08:25:22.939Z',
      { query: '你在干嘛啊' },
      10,
      'now',
    );

    expect(context.is_recently_active).toBe(true);
    expect(context.should_prefer_conversation_continuity_for_now).toBe(true);
    expect(context.active_topic_summary).toContain('讨论 timeline');
  });
});
