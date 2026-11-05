import { useEffect, useState } from 'react';

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

export function useAdminStream(onEvent?: (event: StreamEvent) => void) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('unipay_token');
    if (!token) return;

    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/admin/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) throw new Error(`SSE stream failed: ${response.status}`);
      setIsConnected(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          const line = event.split('\n').find((entry) => entry.startsWith('data: '));
          if (!line) continue;
          const data: StreamEvent = JSON.parse(line.slice(6));
          if (data.type !== 'CONNECTED') onEvent?.(data);
        }
      }
    }).catch((error) => {
      if (!controller.signal.aborted) console.error('SSE stream error:', error);
      setIsConnected(false);
    });

    return () => {
      controller.abort();
      setIsConnected(false);
    };
  }, [onEvent]);

  return { isConnected };
}
