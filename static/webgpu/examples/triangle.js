export async function initialize(canvas) {
  // adapter is required only for device, most webgpu api goes through device
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!device) {
    throw new Error("WebGPU is not supported");
  }

  // context is the target to draw to - the webgpu pipeline is separated from the target
  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new Error("Unable to create a WebGPU canvas context");
  }

  resizeCanvas(canvas, device);

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  // we need to tell our target what will draw to it
  context.configure({
    device,
    format: presentationFormat
  });

  // pipeline is device only
  const module = device.createShaderModule({
    label: "triangle shader module",
    code: /*wgsl */ `
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> @builtin(position) vec4f {
        let pos = array(
          vec2f(0.0, 0.5),
          vec2f(-0.5, -0.5),
          vec2f(0.5, -0.5)
        );

        return vec4f(pos[vertexIndex], 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
      }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'triangle pipeline',
    layout: 'auto',
    vertex: {
      // entryPoint: 'vs',
      module,
    },
    fragment: {
      // entryPoint: 'fs',
      module,
      targets: [{ format: presentationFormat }],
    },
  });

  const renderPassDescriptor = {
    label: "triangle render pass",
    colorAttachments: [
      {
        //view
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  let destroyed = false;

  function render() {
    if (destroyed) {
      return;
    }

    renderPassDescriptor.colorAttachments[0].view =
      context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: "triangle encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
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

  return { render, destroy };
}

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

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
