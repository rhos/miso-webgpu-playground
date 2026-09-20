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
  const maybeDevice = await adapter?.requestDevice({
    requiredFeatures: ['timestamp-query']
  });

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
            { shaderLocation: 4, offset: 2*4, format: 'unorm8x4'}
          ]
        },
        {
          arrayStride: 4,
          stepMode: 'instance',
          attributes: [
            {shaderLocation: 1, offset: 0, format: 'unorm8x4' },
          ]
        },
        {
          arrayStride: 4 * 4, // 4 floats
          stepMode: 'instance',
          attributes: [
            {shaderLocation: 2, offset: 0, format: 'float32x2'},
            { shaderLocation: 3, offset: 8, format: 'float32x2' },
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
    4;
  const dynamicItemSize =
    2 * 4 + 2 * 4;;

  const kColorOffset = 0;

  const kOffsetOffset = 0;
  const kScaleOffset = 2;

  const kNumObjects = 1000;

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

  /**
   * @type {{ scale: number; offset: number[]; velocity: number[]; }[]}
   */
  const objectInfos = [];

  {
    const staticValuesU8 = new Uint8Array(staticBufferSize);
    for (let i = 0; i < kNumObjects; ++i)
    {
      const staticOffsetU8 = i * staticItemSize
      const staticOffsetF32 = staticOffsetU8 / 4
      staticValuesU8.set([rand()*255, rand()*255, rand()*255, 255], staticOffsetU8 + kColorOffset);
      objectInfos.push({
        scale: rand(0.2, 0.5),
        offset: [rand(-0.9, 0.9), rand(-0.9, 0.9)],
        velocity: [rand(-0.1, 0.1), rand(-0.1, 0.1)],
      });
    }
    device.queue.writeBuffer(staticVertexBuffer, 0, staticValuesU8);
  }

  const dynamicValues = new Float32Array(dynamicBufferSize / 4);

  /** @type {GPURenderPassColorAttachment} */
  const colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: [0.3, 0.3, 0.3, 1],
    loadOp: "clear",
    storeOp: "store",
  };

  const querySet = device.createQuerySet({
     type: 'timestamp',
     count: 2,
  });
  const resolveBuffer = device.createBuffer({
    size: querySet.count * 8,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  const resultBuffer = device.createBuffer({
    size: resolveBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  /** @type {GPURenderPassDescriptor} */
  const renderPassDescriptor = {
    label: "circle render pass",
    colorAttachments: [colorAttachment],
    timestampWrites: {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1
    }
  };

  let destroyed = false;

  function resize() {
    return resizeCanvas(canvas, device);
  }

  const euclideanModulo = (x, a) => x - a * Math.floor(x / a);
  let then = 0;

  let drawnNObjects = 10;

  let gpuTime = 0;

  const infoElem = document.getElementById('circle-vb-output');


  function render(now) {
    if (destroyed) {
      return;
    }
    now *= 0.001;  // convert to seconds
    const deltaTime = now - then;
    then = now;

    const startTime = performance.now();

    const aspect = canvas.width / canvas.height;

    colorAttachment.view = context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: "circle encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setVertexBuffer(1, staticVertexBuffer);
    pass.setVertexBuffer(2, dynamicVertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');

    for (let ndx = 0; ndx < drawnNObjects; ++ndx) {
      const { scale, offset, velocity } = objectInfos[ndx];
      // -1.5 to 1.5
      offset[0] = euclideanModulo(offset[0] + velocity[0] * deltaTime + 1.5, 3) - 1.5;
      offset[1] = euclideanModulo(offset[1] + velocity[1] * deltaTime + 1.5, 3) - 1.5;

      const off = ndx * (dynamicItemSize / 4);
      dynamicValues.set(offset, off + kOffsetOffset);
      dynamicValues.set([scale / aspect, scale], off + kScaleOffset);
    };
    device.queue.writeBuffer(dynamicVertexBuffer, 0, dynamicValues, 0, drawnNObjects * dynamicItemSize / 4);

    pass.drawIndexed(numVertices, drawnNObjects);

    pass.end();
    encoder.resolveQuerySet(querySet, 0, querySet.count, resolveBuffer, 0);

    if (resultBuffer.mapState === 'unmapped')
      encoder.copyBufferToBuffer(resolveBuffer, 0, resultBuffer, 0, resultBuffer.size);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    if (resultBuffer.mapState === 'unmapped') {
      resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigUint64Array(resultBuffer.getMappedRange());
        gpuTime = Number(times[1] - times[0]);
        resultBuffer.unmap();
      });
    }

    const jsTime = performance.now() - startTime;
    infoElem.textContent = `\
fps: ${(1 / deltaTime).toFixed(1)}
js: ${jsTime.toFixed(1)}ms
gpu: ${(gpuTime / 1000).toFixed(1)}µs
`;

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    context.unconfigure();
    device.destroy();
  }

  return { resize, destroy };
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
