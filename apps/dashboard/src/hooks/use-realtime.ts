"use client";

import {
  parseRealtimeEnvelope,
  type RealtimeEventType,
} from "@midday/realtime";
import { useEffect, useRef } from "react";
import { Cookies } from "@/utils/constants";

type EventType = RealtimeEventType;

type RealtimePayload<TRecord> = {
  eventType: EventType;
  new?: TRecord;
  old?: TRecord;
};

interface UseRealtimeProps<TRecord = Record<string, unknown>> {
  channelName: string;
  events?: EventType[];
  table: string;
  filter?: string;
  onEvent: (payload: RealtimePayload<TRecord>) => void;
  onFallbackPoll?: () => void | Promise<void>;
}

const RECONNECT_DELAY_MS = 3_000;
const FALLBACK_POLL_MS = 15_000;

function readCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }

  return null;
}

function getRealtimeWebSocketUrl() {
  const explicit = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (explicit) {
    return explicit;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return "ws://localhost:3003/realtime";
  }

  if (apiUrl.startsWith("https://")) {
    return `${apiUrl.replace("https://", "wss://")}/realtime`;
  }

  return `${apiUrl.replace("http://", "ws://")}/realtime`;
}

export function useRealtime<TRecord = Record<string, unknown>>({
  channelName,
  events = ["INSERT", "UPDATE"],
  table,
  filter,
  onEvent,
  onFallbackPoll,
}: UseRealtimeProps<TRecord>) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!filter) {
      return;
    }

    const wsUrl = new URL(getRealtimeWebSocketUrl());
    wsUrl.searchParams.set("channel", channelName);
    wsUrl.searchParams.set("table", table);
    wsUrl.searchParams.set("filter", filter);

    const accessToken = readCookie(Cookies.AccessToken);
    if (accessToken) {
      wsUrl.searchParams.set("token", accessToken);
    }

    let socket: WebSocket | null = null;
    let isClosed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const startFallbackPolling = () => {
      if (!onFallbackPoll || fallbackPollTimer) {
        return;
      }

      fallbackPollTimer = setInterval(() => {
        void onFallbackPoll();
      }, FALLBACK_POLL_MS);
    };

    const connect = () => {
      if (isClosed) {
        return;
      }

      socket = new WebSocket(wsUrl.toString());

      socket.onopen = () => {
        stopFallbackPolling();

        socket?.send(
          JSON.stringify({
            type: "subscribe",
            channel: channelName,
            table,
            filter,
            events,
          }),
        );
      };

      socket.onmessage = (message) => {
        const envelope = parseRealtimeEnvelope(message.data);

        if (!envelope) {
          return;
        }

        const event = envelope.event;

        if (event.table !== table || event.channel !== channelName) {
          return;
        }

        if (!events.includes(event.eventType)) {
          return;
        }

        onEventRef.current({
          eventType: event.eventType,
          new: event.new as TRecord,
          old: event.old as TRecord,
        });
      };

      socket.onclose = () => {
        startFallbackPolling();

        if (isClosed) {
          return;
        }

        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      isClosed = true;
      stopFallbackPolling();

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
    // events is intentionally excluded - callers should keep event sets static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, onFallbackPoll]);
}
