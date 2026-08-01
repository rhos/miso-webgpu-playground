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
    code: /*wgsl */ `
    struct OurVertexShaderOutput
    {
      @builtin(position) position: vec4f
    };

    struct OurStruct
    {
      color: vec4f,
      offset: vec2f
    };

    struct OtherStruct
    {
      scale: vec2f,
    }


    @group(0) @binding(0) var<uniform> ourStruct: OurStruct;
    @group(0) @binding(1) var<uniform> otherStruct: OtherStruct;

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
      ) -> OurVertexShaderOutput
    {
      let pos = array(
        vec2f( 0.0,  0.5),  // top center
        vec2f(-0.5, -0.5),  // bottom left
        vec2f( 0.5, -0.5)   // bottom right
      );

      var vsOutput: OurVertexShaderOutput;
      vsOutput.position = vec4f(pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
      return vsOutput;
    }

    @fragment fn fs(
      @builtin(position) pixelPosition: vec4f
      ) -> @location(0) vec4f
    {
      let red = vec4f(1, 0, 0, 1);
      let cyan = vec4f(0, 1, 1, 1);

      let grid = vec2u(pixelPosition.xy) / 8;
      let checker = (grid.x + grid.y) % 2 == 1;
      return select(ourStruct.color, red, checker);
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

  const staticUniformBufferSize =
    4 * 4 + // 4 floats, each float 4 bytes
    2 * 4 +
    2 * 4;

  const dynamicUniformBufferSize =
    2 * 4;

  const kColorOffset = 0;
  const kOffsetOffset = 4;

  const kScaleOffset = 0;

  const kNumObjects = 100;
  /**
   * @type {{ scale: number; dynamicUniformBuffer: GPUBuffer; uniformValues: Float32Array<ArrayBuffer>; bindGroup: GPUBindGroup; }[]}
   */
  const objectInfos = [];

  for (let i = 0; i < kNumObjects; ++i)
  {
    const staticUniformBuffer = device.createBuffer({
      label: "ub for ${i}",
      size: staticUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    {
      const uniformValues = new Float32Array(staticUniformBufferSize / 4);
      uniformValues.set([rand(), rand(), rand(), 1], kColorOffset);
      uniformValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], kOffsetOffset);

      device.queue.writeBuffer(staticUniformBuffer, 0, uniformValues);
    }

    const uniformValues = new Float32Array(dynamicUniformBufferSize / 4);
    const dynamicUniformBuffer = device.createBuffer({
      label: "ub for ${i}",
      size: dynamicUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const bindGroup = device.createBindGroup({
      label: "bg for ${i}",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: staticUniformBuffer },
        { binding: 1, resource: dynamicUniformBuffer}
      ]
    });

    objectInfos.push({
      scale: rand(0.2, 0.5),
      dynamicUniformBuffer,
      uniformValues,
      bindGroup
    });
  }

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

    for (const { scale, bindGroup, dynamicUniformBuffer, uniformValues } of objectInfos)
    {
      uniformValues.set([scale / aspect, scale], kScaleOffset);
      device.queue.writeBuffer(dynamicUniformBuffer, 0, uniformValues);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
    }

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
