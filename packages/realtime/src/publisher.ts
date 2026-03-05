import {
  createRealtimeEnvelope,
  type RealtimeEnvelope,
  type RealtimeEvent,
} from "./contracts";

type PublishTransport = (payload: string, channel: string) => Promise<void>;

let publishTransport: PublishTransport | null = null;

export function setRealtimePublishTransport(transport: PublishTransport) {
  publishTransport = transport;
}

export async function publishRealtimeEvent(
  event: Omit<RealtimeEvent, "occurredAt"> & { occurredAt?: string },
): Promise<RealtimeEnvelope> {
  const envelope = createRealtimeEnvelope(event);

  if (publishTransport) {
    await publishTransport(JSON.stringify(envelope), event.channel);
  }

  return envelope;
}
