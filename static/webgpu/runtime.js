// @ts-check

/**
 * @typedef {{
 *   resize?: () => boolean,
 *   render?: () => void,
 *   changeSettings?: (settings: Record<string, unknown>) => void,
 *   destroy: () => void
 * }} Renderer
 */

/** @type {Renderer | null} */
let activeRenderer = null;

/** @type {ResizeObserver | null} */
let resizeObserver = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} exampleId
 * @returns {Promise<void>}
 */
export async function initialize(canvas, exampleId) {
  destroy();

  /** @type {{ initialize: (canvas: HTMLCanvasElement) => Promise<Renderer> }} */
  const implementation = await import(
    `./examples/${exampleId.toLowerCase()}.js?reload=${Date.now()}`
  );
  activeRenderer = await implementation.initialize(canvas);

  activeRenderer.resize?.();
  activeRenderer.render?.();

  resizeObserver = new ResizeObserver(() => {
    if (activeRenderer?.resize?.()) {
      activeRenderer.render?.();
    }
  });
  resizeObserver.observe(canvas);
}

/** @returns {void} */
export function render() {
  activeRenderer?.render?.();
}

/**
 * @param {Record<string, unknown>} settings
 * @returns {void}
 */
export function changeSettings(settings) {
  activeRenderer?.changeSettings?.(settings);
}

/** @returns {void} */
export function destroy() {
  resizeObserver?.disconnect();
  resizeObserver = null;

  activeRenderer?.destroy();
  activeRenderer = null;
}
