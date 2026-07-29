// @ts-check

/**
 * @typedef {{
 *   render: () => void,
 *   destroy: () => void
 * }} Renderer
 */

/** @type {Renderer | null} */
let activeRenderer = null;

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
  activeRenderer.render?.();
}

/** @returns {void} */
export function render() {
  activeRenderer?.render?.();
}

/** @returns {void} */
export function destroy() {
  activeRenderer?.destroy();
  activeRenderer = null;
}
