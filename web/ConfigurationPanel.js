import { formatDuration } from './earth/TracerControls.js';
// Controls derive from the same schema as defaults, bounds and saved preferences.
export function mountConfigurationPanel(root, store) {
  const listeners = new AbortController(), inputs = new Map(), groups = new Map();
  root.replaceChildren();
  for (const field of store.fields) {
    if (!groups.has(field.group)) {
      const set = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = field.group;
      const grid = document.createElement('div'); grid.className = 'tracer-settings-grid';
      set.append(legend, grid); root.append(set); groups.set(field.group, grid);
    }
    const wrapper = document.createElement('div'); wrapper.className = 'tracer-setting';
    const label = document.createElement('label'), output = document.createElement('output'), input = document.createElement(field.choices ? 'select' : 'input');
    input.id = `config-${field.key}`;
    if (field.choices) for (const [value, text] of field.choices) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
    } else {
      input.type = field.kind === 'boolean' ? 'checkbox' : 'range';
      if (input.type === 'range') for (const key of ['min', 'max', 'step']) input[key] = field[key];
    }
    label.htmlFor = input.id; label.append(field.label + ' ', output); output.htmlFor = input.id;
    wrapper.append(label, input);
    if (field.help) {
      const help = document.createElement('p'); help.id = `${input.id}-help`; help.className = 'note'; help.textContent = field.help;
      input.setAttribute('aria-describedby', help.id); wrapper.append(help);
    }
    input.addEventListener('input', () => store.update({ [field.key]: field.choices ? input.value : field.kind === 'boolean' ? input.checked : Number(input.value) }), { signal: listeners.signal });
    groups.get(field.group).append(wrapper); inputs.set(field.key, { input, output });
  }
  const actions = document.createElement('div'); actions.className = 'tracer-settings-actions';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset all appearance defaults';
  const note = document.createElement('span'); note.role = 'status';
  reset.addEventListener('click', () => store.reset(), { signal: listeners.signal });
  actions.append(reset, note); root.append(actions);
  const unsubscribe = store.subscribe(values => {
    for (const field of store.fields) {
      const { input, output } = inputs.get(field.key), value = values[field.key];
      const formatted = field.choices || field.kind === 'boolean' ? '' : field.unit === 'seconds' ? formatDuration(value) : field.unit === 'percent' ? `${Math.round(value * 100)}%`
        : field.unit === 'scale' ? `${value}×` : `${value}`;
      if (field.kind === 'boolean') input.checked = value; else input.value = value; output.textContent = formatted; if (!field.choices && field.kind !== 'boolean') input.setAttribute('aria-valuetext', formatted);
    }
    note.textContent = store.saved ? 'Saved for all previews on this browser.' : 'Settings work for this visit; browser storage is unavailable.';
  });
  return () => { unsubscribe(); listeners.abort(); };
}
