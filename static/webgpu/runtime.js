let activeRenderer = null;
let activeCanvas = null;
let pendingCanvas = null;
let generation = 0;

export async function initialize(canvas, exampleId) {
  const currentGeneration = ++generation;
  pendingCanvas = canvas;
  releaseActiveRenderer();

  let renderer;
  try {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exampleId)) {
      throw new Error(`Invalid WebGPU example: ${exampleId}`);
    }

    const implementation = await import(
      `./examples/${exampleId}.js?reload=${Date.now()}`
    );
    renderer = await implementation.initialize(canvas);
  } catch (error) {
    if (currentGeneration === generation) {
      pendingCanvas = null;
    }
    throw error;
  }

  if (currentGeneration !== generation) {
    renderer.destroy();
    return;
  }

  pendingCanvas = null;
  activeCanvas = canvas;
  activeRenderer = renderer;
  activeRenderer.render();
}

export function render() {
  activeRenderer?.render();
}

export function destroy(canvas) {
  if (canvas !== pendingCanvas && canvas !== activeCanvas) {
    return;
  }

  generation += 1;

  if (canvas === pendingCanvas) {
    pendingCanvas = null;
  }

  if (canvas === activeCanvas) {
    releaseActiveRenderer();
  }
}

function releaseActiveRenderer() {
  activeRenderer?.destroy();
  activeRenderer = null;
  activeCanvas = null;
}
