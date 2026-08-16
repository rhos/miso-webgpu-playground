import { mat4 } from 'https://webgpufundamentals.org/3rdparty/wgpu-matrix.module.js';

function generateFace(size, {faceColor, textColor, text}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${size * 0.7}px sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const m = ctx.measureText(text);
  ctx.fillText(
    text,
    (size - m.actualBoundingBoxRight + m.actualBoundingBoxLeft) / 2,
    (size - m.actualBoundingBoxDescent + m.actualBoundingBoxAscent) / 2
  );
  return canvas;
}

const faceSize = 128;
const faceCanvases = [
  { faceColor: '#F00', textColor: '#0FF', text: '+X' },
  { faceColor: '#FF0', textColor: '#00F', text: '-X' },
  { faceColor: '#0F0', textColor: '#F0F', text: '+Y' },
  { faceColor: '#0FF', textColor: '#F00', text: '-Y' },
  { faceColor: '#00F', textColor: '#FF0', text: '+Z' },
  { faceColor: '#F0F', textColor: '#0F0', text: '-Z' },
].map(faceInfo => generateFace(faceSize, faceInfo));

function createCubeVertices() {
  const vertexData = new Float32Array([
     // front face
    -1,  1,  1,
    -1, -1,  1,
     1,  1,  1,
     1, -1,  1,
     // right face
     1,  1, -1,
     1,  1,  1,
     1, -1, -1,
     1, -1,  1,
     // back face
     1,  1, -1,
     1, -1, -1,
    -1,  1, -1,
    -1, -1, -1,
    // left face
    -1,  1,  1,
    -1,  1, -1,
    -1, -1,  1,
    -1, -1, -1,
    // bottom face
     1, -1,  1,
    -1, -1,  1,
     1, -1, -1,
    -1, -1, -1,
    // top face
    -1,  1,  1,
     1,  1,  1,
    -1,  1, -1,
     1,  1, -1,
  ]);

  const indexData = new Uint16Array([
     0,  1,  2,  2,  1,  3,  // front
     4,  5,  6,  6,  5,  7,  // right
     8,  9, 10, 10,  9, 11,  // back
    12, 13, 14, 14, 13, 15,  // left
    16, 17, 18, 18, 17, 19,  // bottom
    20, 21, 22, 22, 21, 23,  // top
  ]);

  return {
    vertexData,
    indexData,
    numVertices: indexData.length,
  };
}

const numMipLevels = (...sizes) => {
  const maxSize = Math.max(...sizes);
  return 1 + Math.log2(maxSize) | 0;
};

const generateMips = (() => {
  /** @type {GPUSampler} */
  let sampler;
  /** @type {GPUShaderModule} */
  let module;
  /** @type {Partial<Record<GPUTextureFormat, GPURenderPipeline>>} */
  const pipelineByFormat = {}

  /**
   * @param {GPUDevice} device
   * @param {GPUTexture} texture
   */
  return function generateMips(device, texture) {
    if (!module) {
      module = device.createShaderModule({
        label: 'textured quad shaders for mip level generation',
        code: /* wgsl */ `
          struct VSOutput {
            @builtin(position) position: vec4f,
            @location(0) texcoord: vec2f,
          };

          @vertex fn vs(
            @builtin(vertex_index) vertexIndex : u32
          ) -> VSOutput {
            let pos = array(
              // 1st triangle
              vec2f( 0.0,  0.0),  // center
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 0.0,  1.0),  // center, top

              // 2nd triangle
              vec2f( 0.0,  1.0),  // center, top
              vec2f( 1.0,  0.0),  // right, center
              vec2f( 1.0,  1.0),  // right, top
            );

            var vsOutput: VSOutput;
            let xy = pos[vertexIndex];
            vsOutput.position = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
            vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
            return vsOutput;
          }

          @group(0) @binding(0) var ourSampler: sampler;
          @group(0) @binding(1) var ourTexture: texture_2d<f32>;

          @fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
            return textureSample(ourTexture, ourSampler, fsInput.texcoord);
          }
        `,
      });

      sampler = device.createSampler({
        minFilter: 'linear',
      });
    }

    if (!pipelineByFormat[texture.format]) {
      pipelineByFormat[texture.format] = device.createRenderPipeline({
        label: 'mip level generator pipeline',
        layout: 'auto',
        vertex: {
          module,
        },
        fragment: {
          module,
          targets: [{ format: texture.format }],
        },
      });
    }
    const pipeline = pipelineByFormat[texture.format];

    const encoder = device.createCommandEncoder({
      label: 'mip gen encoder',
    });

    for (let baseMipLevel = 1; baseMipLevel < texture.mipLevelCount; ++baseMipLevel)
    {
      for (let layer = 0; layer < texture.depthOrArrayLayers; ++layer)
      {
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            {
              binding: 1,
              resource: texture.createView({
                dimension: '2d',
                baseMipLevel: baseMipLevel - 1,
                mipLevelCount: 1,
                baseArrayLayer: layer,
                arrayLayerCount: 1,
              }),
            },
          ],
        });

        /** @type {GPURenderPassDescriptor} */
        const renderPassDescriptor = {
          label: 'our basic canvas renderPass',
          colorAttachments: [
            {
              view: texture.createView({
                dimension: '2d',
                baseMipLevel: baseMipLevel,
                mipLevelCount: 1,
                baseArrayLayer: layer,
                arrayLayerCount: 1,
              }),
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        };

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);  // call our vertex shader 6 times
        pass.end();
      }
    }
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  };
})();


/**
 * @param {GPUDevice} device
 * @param {GPUTexture} texture
 */
function copySourcesToTexture(device, texture, sources, {flipY = false} = {}) {
  sources.forEach((source, layer) => {
    device.queue.copyExternalImageToTexture(
      { source, flipY, },
      { texture, origin : [0, 0, layer] },
      { width: source.width, height: source.height },
    );
  });

  if (texture.mipLevelCount > 1) {
    generateMips(device, texture);
  }
}

/**
 * @param {GPUDevice} device
 * @param {ImageBitmap} source
 */
function createTextureFromSources(device, sources, options = {}) {
  const source = sources[0]
  const texture = device.createTexture({
    format: 'rgba8unorm',
    mipLevelCount: options.mips ? numMipLevels(source.width, source.height) : 1,
    size: [source.width, source.height, sources.length],
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  copySourcesToTexture(device, texture, sources, options);
  return texture;
}

/**
 * @param {GPUDevice} device
 * @param {RequestInfo | URL} url
 * @param {{} | undefined} options
 */
async function createTextureFromImage(device, url, options) {
  const imgBitmap = await loadImageBitmap(url);
  return createTextureFromSource(device, imgBitmap, options);
}

function copySourceToTexture(device, texture, source, options = {}) {
  copySourcesToTexture(device, texture, [source], options);
}

function createTextureFromSource(device, source, options = {}) {
  return createTextureFromSources(device, [source], options);
}

/**
 * @param {RequestInfo | URL} url
 */
async function loadImageBitmap(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Unable to load image: ${res.status} ${res.url}`);
  }

  const blob = await res.blob();
  return createImageBitmap(blob, { colorSpaceConversion: 'none' });
}

/** @param {HTMLCanvasElement} canvas */
export async function initialize(canvas) {
  canvas.style.imageRendering = "pixelated"
  // canvas.style.imageRendering = "crisp-edges"

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

    struct Vertex {
      @location(0) position: vec4f,

    };

    struct OurVertexShaderOutput
    {
      @builtin(position) position : vec4f,
      @location(0) normal : vec3f
    };

    struct Uniforms {
      matrix: mat4x4f,
    };

    @group(0) @binding(0) var<uniform> uni: Uniforms;


    @vertex fn vs(
      vert: Vertex
      ) -> OurVertexShaderOutput
    {
      var vsOutput: OurVertexShaderOutput;
      vsOutput.position = uni.matrix * vert.position;
      vsOutput.normal = normalize(vert.position.xyz);
      return vsOutput;
    }

    @group(0) @binding(1) var ourSampler : sampler;
    @group(0) @binding(2) var ourTexture : texture_cube<f32>;

    @fragment fn fs(
      fsInput : OurVertexShaderOutput
      ) -> @location(0) vec4f
    {
      let resultColor = textureSample(ourTexture, ourSampler, fsInput.normal);
      return resultColor;
    }
    `,
  });

  const texture = createTextureFromSources(
      device, faceCanvases, {mips: true, flipY: false});

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  const uniformBufferSize = (16) * 4;
  const uniformBuffer = device.createBuffer({
    label: 'uniforms',
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformValues = new Float32Array(uniformBufferSize / 4);
  const kMatrixOffset = 0;
  const matrixValue = uniformValues.subarray(kMatrixOffset, kMatrixOffset + 16);

  const { vertexData, indexData, numVertices } = createCubeVertices();
  const vertexBuffer = device.createBuffer({
    label: 'vertex buffer vertices',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  const indexBuffer = device.createBuffer({
    label: 'index buffer',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indexData);
  const pipeline = device.createRenderPipeline({
    label: 'triangle pipeline',
    layout: 'auto',
    vertex: {
      // entryPoint: 'vs',
      module: shaderModule,
      buffers: [
        {
          arrayStride: (3) * 4,
          attributes: [
            {shaderLocation: 0, offset:0, format:'float32x3'}
          ]
        }
      ]
    },
    fragment: {
      // entryPoint: 'fs',
      module : shaderModule,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  const bindGroup = device.createBindGroup({
    label: 'bind group for object',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: uniformBuffer },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView({dimension: 'cube'}) },
    ],
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
    colorAttachments: [colorAttachment],
    depthStencilAttachment: {
      // view: <- to be filled out when we render
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };
  const degToRad = d => d * Math.PI / 180;

  const settings = {
    rotation: [degToRad(20), degToRad(25), degToRad(0)],
  };

  let depthTexture;

  let destroyed = false;

  function resize() {
    return resizeCanvas(canvas, device);
  }

  let texNdx = 2;
  function render() {
    if (destroyed) {
      return;
    }

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const canvasTexture = context.getCurrentTexture();
    renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();

    // If we don't have a depth texture OR if its size is different
    // from the canvasTexture when make a new depth texture
    if (!depthTexture ||
        depthTexture.width !== canvasTexture.width ||
        depthTexture.height !== canvasTexture.height) {
      if (depthTexture) {
        depthTexture.destroy();
      }
      depthTexture = device.createTexture({
        size: [canvasTexture.width, canvasTexture.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');

    const aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(
        60 * Math.PI / 180,
        aspect,
        0.1,      // zNear
        10,      // zFar
        matrixValue,
    );
    const view = mat4.lookAt(
      [0, 1, 5],  // camera position
      [0, 0, 0],  // target
      [0, 1, 0],  // up
    );
    mat4.multiply(matrixValue, view, matrixValue);
    mat4.rotateX(matrixValue, settings.rotation[0], matrixValue);
    mat4.rotateY(matrixValue, settings.rotation[1], matrixValue);
    mat4.rotateZ(matrixValue, settings.rotation[2], matrixValue);

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed(numVertices);

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
  var desiredWidth = Math.round(canvas.clientWidth * pixelRatio) | 0
  var desiredHeight = Math.round(canvas.clientHeight * pixelRatio) | 0

  const width = Math.min(
    limit,
    Math.max(1, desiredWidth),
  );

  const height = Math.min(
    limit,
    Math.max(1, desiredHeight),
  );

  if (canvas.width === width && canvas.height === height) {
    return false;
  }

  canvas.width = width
  canvas.height = height
  return true;
}
