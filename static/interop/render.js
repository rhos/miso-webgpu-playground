export async function run(canvas) {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!device) {
    fail("no webgpu support");
    return;
  }

  resizeCanvas(canvas, device);

  const context = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat
  });

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
        return vec4f(1.0, 1.0, 0.0, 1.0);
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


  function render() {
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
  render();

}

function resizeCanvas(canvas, device) {
  const pixelRatio = window.devicePixelRatio || 1;
  const limit = device.limits.maxTextureDimension2D;

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

function fail(msg) {
  alert(msg);
}
