import { useCallback, useEffect, useRef, useState } from "react";
import type { Stream } from "../config/types";
import { fetchLeagueLog, leagueConfigs } from "../lib/renderLog/leagues";
import { BIG_PLAY_DURATION_MS, BIG_PLAY_WARNING_MS, getBigPlay, getPlayKey } from "../lib/renderLog/indicators";
import type { LogType } from "../lib/renderLog/types";

const POLL_INTERVAL_MS = 10_000;
type LogState = { key: string; log: LogType | null; error: string; bigPlay: boolean };

export function useStreamLog(stream: Stream, delayMs: number, refreshRequestId = 0) {
  const { slug, category, espn_id } = stream;
  // Metadata and playback URL updates must not reset the game's delay or alerts.
  const streamRef = useRef(stream);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  const key = JSON.stringify([slug, category, espn_id, delay]);
  const [state, setState] = useState<LogState>({ key: "", log: null, error: "", bigPlay: false });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const config = leagueConfigs[category];
    if (!config || espn_id <= 0) return;
    let active = true;
    let latestTimestamp = -Infinity;
    let requestSequence = 0;
    let acceptedSequence = 0;
    let epoch = 0;
    let initialized = false;
    let refreshing = false;
    let activeAlerts = 0;
    const seen = new Set<string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const alerts = new Map<string, { timer: ReturnType<typeof setTimeout>; active: boolean }>();

    const update = (changes: Partial<LogState>) => {
      if (!active) return;
      setState(previous => ({
        ...(previous.key === key ? previous : { key, log: null, error: "", bigPlay: false }),
        ...changes,
      }));
    };
    const schedule = (fn: () => void, timeout: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) fn();
      }, timeout);
      timers.add(timer);
      return timer;
    };
    const clearTimers = () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      alerts.clear();
      activeAlerts = 0;
    };
    const publish = (log: LogType) => {
      if (!active) return;
      setState(previous => {
        if (previous.key === key && previous.log && previous.log.timestamp > log.timestamp) return previous;
        return { key, log, error: "", bigPlay: previous.key === key && previous.bigPlay };
      });
    };

    const fetchLog = async (immediate = false) => {
      const sequence = ++requestSequence;
      const requestEpoch = epoch;
      try {
        const log = await fetchLeagueLog(streamRef.current, config);
        if (!active || requestEpoch !== epoch || sequence < acceptedSequence || !log || log.timestamp < latestTimestamp) return;
        acceptedSequence = sequence;
        latestTimestamp = log.timestamp;
        update({ error: "" });

        const plays = log.playByPlay.flatMap(drive => (drive.plays ?? []).map(play => ({ play, team: drive.team })));
        // ESPN can revise a play after publishing it. Retract obsolete warnings.
        for (const { play, team } of plays) {
          const playKey = getPlayKey(play, team);
          const alert = alerts.get(playKey);
          if (alert && (!getBigPlay(play) || log.gameFinished)) {
            clearTimeout(alert.timer);
            timers.delete(alert.timer);
            if (alert.active) activeAlerts -= 1;
            alerts.delete(playKey);
            update({ bigPlay: activeAlerts > 0 });
          }
        }
        if (!initialized) {
          for (const { play, team } of plays.slice(0, -1)) seen.add(getPlayKey(play, team));
        }
        const candidates = initialized ? plays : plays.slice(-1);
        if (!immediate && config.playType === "football" && !log.gameFinished) {
          for (const { play, team } of candidates) {
            const playKey = getPlayKey(play, team);
            if (seen.has(playKey) || !getBigPlay(play)) continue;
            seen.add(playKey);
            const alert = { active: false, timer: schedule(() => {
              alert.active = true;
              activeAlerts += 1;
              update({ bigPlay: true });
              alert.timer = schedule(() => {
                activeAlerts -= 1;
                alerts.delete(playKey);
                update({ bigPlay: activeAlerts > 0 });
              }, BIG_PLAY_DURATION_MS);
            }, Math.max(0, delay - BIG_PLAY_WARNING_MS)) };
            alerts.set(playKey, alert);
          }
        }
        if (immediate) for (const { play, team } of plays) seen.add(getPlayKey(play, team));
        initialized = true;
        if (immediate) publish(log);
        else schedule(() => publish(log), delay);
      } catch (error) {
        if (!active || requestEpoch !== epoch || sequence < acceptedSequence) return;
        console.error("multisport:fetchLog", error);
        update({ error: "Unable to load play-by-play." });
      }
    };
    refreshRef.current = async () => {
      epoch += 1;
      const refreshEpoch = epoch;
      refreshing = true;
      clearTimers();
      update({ bigPlay: false });
      try { await fetchLog(true); }
      finally { if (epoch === refreshEpoch) refreshing = false; }
    };
    void fetchLog();
    const poll = setInterval(() => { if (!refreshing) void fetchLog(); }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(poll);
      clearTimers();
      refreshRef.current = async () => {};
    };
  }, [category, espn_id, key, delay]);

  const previousRefresh = useRef(refreshRequestId);
  useEffect(() => {
    if (previousRefresh.current === refreshRequestId) return;
    previousRefresh.current = refreshRequestId;
    if (refreshRequestId !== 0) void refresh();
  }, [refresh, refreshRequestId]);

  const current = state.key === key ? state : { log: null, error: "", bigPlay: false };
  return { displayedLog: current.log, errorMessage: current.error, bigPlay: current.bigPlay, refresh };
}
