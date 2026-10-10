// A visible consumer of the same event feed that orbital sound can subscribe to.
// No timers, sound synthesis, event mutations, or renderer callbacks.
export function mountEventPlaybackLog(container, feed) {
  const summary = container.querySelector('[data-event-count]');
  const status = container.querySelector('[data-event-status]');
  const list = container.querySelector('ol');
  let count = 0, recent = [];
  const clear = state => {
    if (!['collection','seek','initial'].includes(state.reason)) return;
    count = 0; recent = []; list.replaceChildren();
    container.hidden = !state.eventCount;
    summary.textContent = '0';
    status.textContent = state.reason === 'seek'
      ? 'Clock repositioned. Resume or replay to pass through events.'
      : 'No events reached in playback yet.';
  };
  const offState = feed.subscribeState(clear);
  const offEvents = feed.subscribeCrossings(batch => {
    count += batch.events.length;
    recent = [...recent, ...batch.events].slice(-5);
    summary.textContent = String(count);
    const latest = recent.at(-1).event;
    status.textContent = `${count} event${count === 1 ? '' : 's'} reached. Latest: ${latest.object.name} · ${latest.eventKind}.`;
    list.replaceChildren(...[...recent].reverse().map(({ event, displayTimeMs }) => {
      const item = document.createElement('li');
      const time = new Date(displayTimeMs).toISOString().replace('T',' ').replace(/\.\d{3}Z$/, ' UTC');
      item.textContent = `${event.object.name} · ${event.eventKind} · ${time} (${event.eventTime.precision === 'day' ? 'assigned time within the reported day' : 'reported time'})`;
      return item;
    }));
  });
  return () => { offState(); offEvents(); };
}
