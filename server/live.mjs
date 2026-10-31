import { randomUUID } from 'node:crypto';

// All app operations go through the public Sky API. No shell commands or
// process injection are used to interact with Wonderdraft.
export class WonderdraftLive {
  constructor(sky) { this.sky = sky; this.observation = null; }
  async windows() {
    return (await this.sky.list_windows()).filter(w =>
      /(?:^|[\\/])Wonderdraft\.exe$/i.test(w.app));
  }
  async select(id) {
    const candidates = (await this.windows()).filter(w => id === undefined || w.id === id);
    if (candidates.length !== 1) throw new Error(`Expected one Wonderdraft window; found ${candidates.length}. Call live_windows and select an id.`);
    return candidates[0];
  }
  async observe(id) {
    let window = await this.select(id);
    await this.sky.activate_window({window});
    window = await this.sky.get_window({id:window.id,app:window.app});
    const state = await this.sky.get_window_state({window, include_screenshot: true, include_text: true});
    const token = randomUUID();
    this.observation = {token, time: Date.now(), state};
    return {token, window: state.window, accessibility: state.accessibility,
      screenshots: state.screenshots.map(s => ({...s}))};
  }
  async activate(id) {
    const window = await this.select(id);
    this.observation = null;
    await this.sky.activate_window({window});
    return this.observe(window.id);
  }
  async act(token, action) {
    const observed = this.observation;
    this.observation = null; // A token authorizes exactly one attempt, even on error.
    if (!observed || token !== observed.token || Date.now() - observed.time > 60000)
      throw new Error('Observation is missing, stale, or already consumed. Call live_observe first.');
    const window = await this.select(observed.state.window.id);
    const screenshot = observed.state.screenshots[0];
    const point = (x, y) => {
      if (!screenshot || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
          x >= screenshot.width || y >= screenshot.height) throw new Error('Point is outside the observed Wonderdraft window.');
    };
    const coord = {window, screenshotId: screenshot?.id};
    if (action.type === 'element_click' || action.type === 'set_value') {
      const tree=observed.state.accessibility?.tree || '';
      if (!Number.isInteger(action.element_index) || !new RegExp(`(?:^|\\n)\\s*${action.element_index} `).test(tree))
        throw new Error('Element index is absent from the latest Wonderdraft accessibility tree.');
      if(action.type==='element_click') await this.sky.click({window,element_index:action.element_index});
      else await this.sky.set_value({window,element_index:action.element_index,value:action.value});
    } else if (action.type === 'click') {
      point(action.x, action.y);
      await this.sky.click({...coord, x: action.x, y: action.y, mouse_button: action.button || 'left'});
    } else if (action.type === 'drag') {
      point(action.from_x, action.from_y); point(action.to_x, action.to_y);
      await this.sky.drag({...coord, from_x: action.from_x, from_y: action.from_y, to_x: action.to_x, to_y: action.to_y});
    } else if (action.type === 'scroll') {
      point(action.x, action.y);
      await this.sky.scroll({...coord, x: action.x, y: action.y, scrollX: action.scrollX || 0, scrollY: action.scrollY || 0});
    } else if (action.type === 'key') {
      // Keep desktop/system shortcuts out of this app-specific surface.
      if (!/^(?:(?:Control_L|Shift_L)\+)*(?:[a-z0-9]|Return|Escape|Tab|space|BackSpace|Delete|Left|Right|Up|Down|Home|End|plus|minus)$/i.test(action.key))
        throw new Error('Unsupported app key chord.');
      await this.sky.press_key({window, key: action.key});
    } else if (action.type === 'text') {
      if (!observed.state.accessibility?.focused_element)
        throw new Error('Observe a focused Wonderdraft text field before typing.');
      await this.sky.type_text({window, text: action.text});
    } else throw new Error('Unsupported action');
    return this.observe(window.id);
  }
}
