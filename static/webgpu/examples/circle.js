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

function createCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri, 2 values (xy) each.
  const numVertices = numSubdivisions * 3 * 2;
  const vertexData = new Float32Array(numSubdivisions * 2 * 3 * 2);

  let offset = 0;
  const addVertex = (/** @type {number} */ x, /** @type {number} */ y) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
  };

  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
    const angle2 = startAngle + (i + 1) * (endAngle - startAngle) / numSubdivisions;

    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);

    // first triangle
    addVertex(c1 * radius, s1 * radius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c1 * innerRadius, s1 * innerRadius);

    // second triangle
    addVertex(c1 * innerRadius, s1 * innerRadius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c2 * innerRadius, s2 * innerRadius);
  }

  return {
    vertexData,
    numVertices,
  };
}

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
    label: "circle shader module",
    code: /*wgsl */ `
    struct OurVertexShaderOutput
    {
      @builtin(position) position: vec4f,
      @location(0) color: vec4f
    };

    struct OurStruct
    {
      color: vec4f,
      offset: vec2f
    };

    struct OtherStruct
    {
      scale: vec2f,
    };

    struct Vertex
    {
      position: vec2f
    };


    @group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
    @group(0) @binding(1) var<storage, read> otherStructs: array<OtherStruct>;
    @group(0) @binding(2) var<storage, read> pos: array<Vertex>;

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32,
      @builtin(instance_index) instanceIndex : u32
    ) -> OurVertexShaderOutput
    {
      let otherStruct = otherStructs[instanceIndex];
      let ourStruct = ourStructs[instanceIndex];

      var vsOutput: OurVertexShaderOutput;
      vsOutput.position = vec4f(pos[vertexIndex].position * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
      vsOutput.color = ourStruct.color;
      return vsOutput;
    }

    @fragment fn fs(
      vsOut : OurVertexShaderOutput
    ) -> @location(0) vec4f
    {
      let red = vec4f(1, 0, 0, 1);
      let cyan = vec4f(0, 1, 1, 1);

      let grid = vec2u(vsOut.position.xy) / 8;
      let checker = (grid.x + grid.y) % 2 == 1;
      return select(vsOut.color, red, checker);
    }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'circle pipeline',
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

  const staticItemSize =
    4 * 4 + // 4 floats, each float 4 bytes
    2 * 4 +
    2 * 4; // padding as vec4f requires 16 aligment

  const dynamicItemSize =
    2 * 4;

  const kColorOffset = 0;
  const kOffsetOffset = 4;

  const kScaleOffset = 0;

  const kNumObjects = 100;

  const staticBufferSize = staticItemSize * kNumObjects;
  const dynamicBufferSize = dynamicItemSize * kNumObjects;

  const staticStorageBuffer = device.createBuffer({
    label: "sb",
    size: staticBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  const dynamicStorageBuffer = device.createBuffer({
    label: "db",
    size: dynamicBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  const { vertexData, numVertices } = createCircleVertices({
    radius: 0.5,
    innerRadius: 0.25
  });
  const vertexStorageBuffer = device.createBuffer({
    label: "vb",
    size: vertexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
   device.queue.writeBuffer(vertexStorageBuffer, 0, vertexData);

  /** @type {{ scale: number; }[]} */
  const objectInfos = [];

  {
    const staticValues = new Float32Array(staticBufferSize / 4);
    for (let i = 0; i < kNumObjects; ++i)
    {
      const staticOffset = i * (staticItemSize / 4)
      staticValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);
      staticValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);
      objectInfos.push({
        scale: rand(0.2, 0.5)
      });
    }
    device.queue.writeBuffer(staticStorageBuffer, 0, staticValues);
  }

  const dynamicValues = new Float32Array(dynamicBufferSize / 4);
  const bindGroup = device.createBindGroup({
    label: "bg",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: staticStorageBuffer },
      { binding: 1, resource: dynamicStorageBuffer },
      { binding: 2, resource: vertexStorageBuffer },
    ]
  })


  /** @type {GPURenderPassColorAttachment} */
  const colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: [0.3, 0.3, 0.3, 1],
    loadOp: "clear",
    storeOp: "store",
  };

  /** @type {GPURenderPassDescriptor} */
  const renderPassDescriptor = {
    label: "circle render pass",
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

    const encoder = device.createCommandEncoder({ label: "circle encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);

    objectInfos.forEach(({ scale }, ndx) => {
      const offset = ndx * (dynamicItemSize / 4);
      dynamicValues.set([scale / aspect, scale], offset + kScaleOffset);
    });
    device.queue.writeBuffer(dynamicStorageBuffer, 0, dynamicValues);

    pass.setBindGroup(0, bindGroup);
    pass.draw(numVertices, kNumObjects);

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
