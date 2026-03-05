export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export type RealtimeEvent<TRecord = Record<string, unknown>> = {
  teamId: string;
  table: string;
  channel: string;
  eventType: RealtimeEventType;
  recordId?: string;
  new?: TRecord;
  old?: TRecord;
  occurredAt: string;
};

export type RealtimeEnvelope<TRecord = Record<string, unknown>> = {
  type: "realtime_event";
  event: RealtimeEvent<TRecord>;
};

export function createRealtimeEnvelope<TRecord = Record<string, unknown>>(
  event: Omit<RealtimeEvent<TRecord>, "occurredAt"> & {
    occurredAt?: string;
  },
): RealtimeEnvelope<TRecord> {
  return {
    type: "realtime_event",
    event: {
      ...event,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    },
  };
}

export function parseRealtimeEnvelope(value: string): RealtimeEnvelope | null {
  try {
    const parsed = JSON.parse(value) as RealtimeEnvelope;

    if (!parsed || parsed.type !== "realtime_event" || !parsed.event) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
