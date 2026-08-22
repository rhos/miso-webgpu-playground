// @ts-check

/** @type {(min?: number, max?: number) => number} */
const rand = (min, max) => {
  if (min === undefined) {
    min = 0;
    max = 1;
  } else if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max - min);
};

/** @param {HTMLCanvasElement} canvas */
export async function initialize(canvas) {
  // adapter is required only for device, most webgpu api goes through device
  const adapter = await navigator.gpu?.requestAdapter();
  const maybeDevice = await adapter?.requestDevice();

  if (!maybeDevice) {
    throw new Error("WebGPU is not supported");
  }

  const device = maybeDevice;
  // context is the target to draw to - the webgpu pipeline is separated from the target
  const maybeContext = canvas.getContext("webgpu");

  if (!maybeContext) {
    device.destroy();
    throw new Error("Unable to create a WebGPU canvas context");
  }

  const context = maybeContext;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  // we need to tell our target what will draw to it
  context.configure({
    device,
    format: presentationFormat
  });

  // pipeline is device only
  const shaderModule = device.createShaderModule({
    label: "triangle shader module",
    code: /* wgsl */ `
      struct MyImmediates {
        color: vec4f,
        offset: vec2f
      };

      var<immediate> myImmediates : MyImmediates;

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> @builtin(position) vec4f {
        let pos = array(
          vec2f( 0.0,  0.5),  // top center
          vec2f(-0.5, -0.5),  // bottom left
          vec2f( 0.5, -0.5)   // bottom right
        );

        return vec4f(pos[vertexIndex] + myImmediates.offset, 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return myImmediates.color;
      }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'triangle pipeline',
    layout: 'auto',
    vertex: {
      // entryPoint: 'vs',
      module : shaderModule,
    },
    fragment: {
      // entryPoint: 'fs',
      module : shaderModule,
      targets: [{ format: presentationFormat }],
    },
  });

  /** @type {GPURenderPassColorAttachment} */
  const colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: [0.3, 0.3, 0.3, 1],
    loadOp: "clear",
    storeOp: "store",
  };

  /** @type {GPURenderPassDescriptor} */
  const renderPassDescriptor = {
    label: "triangle render pass",
    colorAttachments: [ colorAttachment ],
  };

  let destroyed = false;

  function resize() {
    return resizeCanvas(canvas, device);
  }

  function render() {
    if (destroyed) {
      return;
    }

    const aspect = canvas.width / canvas.height;

    colorAttachment.view = context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: "triangle encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);

    pass.setImmediates(0, new Float32Array([
      1, 0, 1, 1,
      -0.4, -0.2
    ]))
    pass.draw(3);

    pass.setImmediates(0, new Float32Array([
      1, 1, 1, 1,
      0.4, 0.2
    ]))
    pass.draw(3);

    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    context.unconfigure();
    device.destroy();
  }

  return { resize, render, destroy };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {GPUDevice} device
 * @returns {boolean}
 */
function resizeCanvas(canvas, device) {
  // dpi
  const pixelRatio = window.devicePixelRatio || 1;
  const limit = device.limits.maxTextureDimension2D;

  // canvas.client* are real sizes
  const width = Math.min(
    limit,
    Math.max(1, Math.round(canvas.clientWidth * pixelRatio)),
  );

  const height = Math.min(
    limit,
    Math.max(1, Math.round(canvas.clientHeight * pixelRatio)),
  );

  if (canvas.width === width && canvas.height === height) {
    return false;
  }

  canvas.width = width;
  canvas.height = height;
  return true;
}
