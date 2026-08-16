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
  const numVertices = (numSubdivisions + 1) * 2;
  const vertexData = new Float32Array(numVertices * (2 + 1));
  const colorData = new Uint8Array(vertexData.buffer);

  let offset = 0;
  let colorOffset = 8;
  const addVertex = (x,y,r,g,b) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
    offset += 1;
    colorData[colorOffset++] = r * 255;
    colorData[colorOffset++] = g * 255;
    colorData[colorOffset++] = b * 255;
    colorOffset += 9;
  };

  const innerColor = [1, 1, 1];
  const outerColor = [0.1, 0.1, 0.1];
  // 2 triangles per subdivision
  //
  // 0  2  4  6  8 ...
  //
  // 1  3  5  7  9 ...
  for (let i = 0; i <= numSubdivisions; ++i) {
    const angle = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;

    const c1 = Math.cos(angle);
    const s1 = Math.sin(angle);

    addVertex(c1 * radius, s1 * radius, ...outerColor);
    addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
  }

  const indexData = new Uint32Array(numSubdivisions * 6);
  let ndx = 0;

  // 1st tri  2nd tri  3rd tri  4th tri
  // 0 1 2    2 1 3    2 3 4    4 3 5
  //
  // 0--2        2     2--4        4  .....
  // | /        /|     | /        /|
  // |/        / |     |/        / |
  // 1        1--3     3        3--5  .....
  for (let i = 0; i < numSubdivisions; ++i) {
    const ndxOffset = i * 2;

    // first triangle
    indexData[ndx++] = ndxOffset;
    indexData[ndx++] = ndxOffset + 1;
    indexData[ndx++] = ndxOffset + 2;

    // second triangle
    indexData[ndx++] = ndxOffset + 2;
    indexData[ndx++] = ndxOffset + 1;
    indexData[ndx++] = ndxOffset + 3;
  }

  return {
    vertexData,
    indexData,

    numVertices: indexData.length,
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

    struct Vertex
    {
      @location(0) position: vec2f,
      @location(1) color: vec4f,
      @location(2) offset: vec2f,
      @location(3) scale: vec2f,
      @location(4) perVertexColor: vec3f,
    };


    @vertex fn vs(
      vert: Vertex) -> OurVertexShaderOutput
    {
      var vsOutput: OurVertexShaderOutput;
      vsOutput.position = vec4f(
        vert.position * vert.scale + vert.offset,
        0.0,
        1.0);
      vsOutput.color = vert.color * vec4f(vert.perVertexColor, 1);
      // vsOutput.color = vec4f(vert.perVertexColor, 1);
      return vsOutput;
    }

    @fragment fn fs(
      vsOut : OurVertexShaderOutput
    ) -> @location(0) vec4f
    {
      return vsOut.color;
    }
    `,
  });

  const pipeline = device.createRenderPipeline({
    label: 'circle pipeline',
    layout: 'auto',
    vertex: {
      // entryPoint: 'vs',
      module: shaderModule,
      buffers: [
        {
          arrayStride: 2*4 + 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            {shaderLocation: 4, offset: 2*4, format: 'unorm8x4'}
          ]
        },
        {
          arrayStride: 4 + 2*4,
          stepMode: 'instance',
          attributes: [
            {shaderLocation: 1, offset: 0, format: 'unorm8x4' },
            {shaderLocation: 2, offset: 4, format: 'float32x2'}
          ]
        },
        {
          arrayStride: 2 * 4, // 2 floats
          stepMode: 'instance',
          attributes: [
            {shaderLocation: 3, offset: 0, format: 'float32x2' },
          ]
        },
      ]
    },
    fragment: {
      // entryPoint: 'fs',
      module : shaderModule,
      targets: [{ format: presentationFormat }],
    },
  });

  const staticItemSize =
    4 +
    2 * 4;
  const dynamicItemSize =
    2 * 4;

  const kColorOffset = 0;
  const kOffsetOffset = 1;

  const kScaleOffset = 0;

  const kNumObjects = 100;

  const staticBufferSize = staticItemSize * kNumObjects;
  const dynamicBufferSize = dynamicItemSize * kNumObjects;

  const { vertexData, indexData, numVertices } = createCircleVertices({
    radius: 0.5,
    innerRadius: 0.25
  });
  const vertexBuffer = device.createBuffer({
    label: "vb",
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  const indexBuffer = device.createBuffer({
    label: 'index buffer',
    size: indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indexData);
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  const staticVertexBuffer = device.createBuffer({
    label: "sb",
    size: staticBufferSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  const dynamicVertexBuffer = device.createBuffer({
    label: "db",
    size: dynamicBufferSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  /** @type {{ scale: number; }[]} */
  const objectInfos = [];

  {
    const staticValuesU8 = new Uint8Array(staticBufferSize);
    const staticValuesF32 = new Float32Array(staticValuesU8.buffer);
    for (let i = 0; i < kNumObjects; ++i)
    {
      const staticOffsetU8 = i * staticItemSize
      const staticOffsetF32 = staticOffsetU8 / 4
      staticValuesU8.set([rand()*255, rand()*255, rand()*255, 255], staticOffsetU8 + kColorOffset);
      staticValuesF32.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffsetF32 + kOffsetOffset);
      objectInfos.push({
        scale: rand(0.2, 0.5)
      });
    }
    device.queue.writeBuffer(staticVertexBuffer, 0, staticValuesF32);
  }

  const dynamicValues = new Float32Array(dynamicBufferSize / 4);

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
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setVertexBuffer(1, staticVertexBuffer);
    pass.setVertexBuffer(2, dynamicVertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');

    objectInfos.forEach(({ scale }, ndx) => {
      const offset = ndx * (dynamicItemSize / 4);
      dynamicValues.set([scale / aspect, scale], offset + kScaleOffset);
    });
    device.queue.writeBuffer(dynamicVertexBuffer, 0, dynamicValues);

    pass.drawIndexed(numVertices, kNumObjects);

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
