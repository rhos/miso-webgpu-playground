// @ts-check
import { mat4 } from 'https://webgpufundamentals.org/3rdparty/wgpu-matrix.module.js';

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

    for (let baseMipLevel = 1; baseMipLevel < texture.mipLevelCount; ++baseMipLevel) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          {
            binding: 1,
            resource: texture.createView({
              baseMipLevel: baseMipLevel - 1,
              mipLevelCount: 1,
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
              baseMipLevel,
              mipLevelCount: 1,
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
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  };
})();


/**
 * @param {GPUDevice} device
 * @param {GPUTexture} texture
 * @param {ImageBitmap} source
 */
function copySourceToTexture(device, texture, source, {flipY = false} = {}) {
  device.queue.copyExternalImageToTexture(
    { source, flipY, },
    { texture },
    { width: source.width, height: source.height },
  );

  if (texture.mipLevelCount > 1) {
    generateMips(device, texture);
  }
}

/**
 * @param {GPUDevice} device
 * @param {ImageBitmap} source
 */
function createTextureFromSource(device, source, options = {}) {
  const texture = device.createTexture({
    format: 'rgba8unorm',
    mipLevelCount: options.mips ? numMipLevels(source.width, source.height) : 1,
    size: [source.width, source.height],
    usage: GPUTextureUsage.TEXTURE_BINDING |
           GPUTextureUsage.COPY_DST |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  copySourceToTexture(device, texture, source, options);
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
    struct OurVertexShaderOutput
    {
      @builtin(position) position : vec4f,
      @location(0) texcoord : vec2f
    };

    struct Uniforms {
      matrix: mat4x4f,
    };

    @group(0) @binding(2) var<uniform> uni: Uniforms;


    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
      ) -> OurVertexShaderOutput
    {
      let pos = array(
        vec2f( 0.0, 0.0 ),
        vec2f( 1.0, 0.0 ),
        vec2f( 0.0, 1.0 ),

        vec2f( 0.0, 1.0 ),
        vec2f( 1.0, 0.0 ),
        vec2f( 1.0, 1.0 ),
      );

      var vsOutput: OurVertexShaderOutput;
      let xy = pos[vertexIndex];
      vsOutput.position = uni.matrix * vec4f(xy, 0.0, 1.0);
      vsOutput.texcoord = xy * vec2f(1, 50);
      return vsOutput;
    }

    @group(0) @binding(0) var ourSampler : sampler;
    @group(0) @binding(1) var ourTexture : texture_2d<f32>;

    @fragment fn fs(
      fsInput : OurVertexShaderOutput
      ) -> @location(0) vec4f
    {
      let resultColor = textureSample(ourTexture, ourSampler, fsInput.texcoord);
      return resultColor;
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

  const textures = await Promise.all([
    await createTextureFromImage(device,
        'https://webgpufundamentals.org/webgpu/resources/images/f-texture.png', {mips: true, flipY: false}),
    await createTextureFromImage(device,
        'https://webgpufundamentals.org/webgpu/resources/images/coins.jpg', {mips: true}),
    await createTextureFromImage(device,
        'https://webgpufundamentals.org/webgpu/resources/images/Granite_paving_tileable_512x512.jpeg', {mips: true}),
  ]);


  // offsets to the various uniform values in float32 indices
  const kMatrixOffset = 0;

  const objectInfos = [];
  for (let i = 0; i < 8; ++i) {
    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: (i & 1) ? 'linear' : 'nearest',
      minFilter: (i & 2) ? 'linear' : 'nearest',
      mipmapFilter: (i & 4) ? 'linear' : 'nearest',
    });

    // create a buffer for the uniform values
    const uniformBufferSize =
      16 * 4; // matrix is 16 32bit floats (4bytes each)
    const uniformBuffer = device.createBuffer({
      label: 'uniforms for quad',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    const uniformValues = new Float32Array(uniformBufferSize / 4);
    const matrix = uniformValues.subarray(kMatrixOffset, 16);

    const bindGroups = textures.map(texture =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texture },
          { binding: 2, resource: uniformBuffer },
        ],
      }));

    // Save the data we need to render this object.
    objectInfos.push({
      bindGroups,
      matrix,
      uniformValues,
      uniformBuffer,
    });
  }


  let destroyed = false;

  function resize() {
    return resizeCanvas(canvas, device);
  }

  let texNdx = 2;
  function render() {
    if (destroyed) {
      return;
    }

    const fov = 60 * Math.PI / 180;  // 60 degrees in radians
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const zNear  = 1;
    const zFar   = 2000;
    const projectionMatrix = mat4.perspective(fov, aspect, zNear, zFar);

    const cameraPosition = [0, 0, 2];
    const up = [0, 1, 0];
    const target = [0, 0, 0];
    const viewMatrix = mat4.lookAt(cameraPosition, target, up);
    const viewProjectionMatrix = mat4.multiply(projectionMatrix, viewMatrix);

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    renderPassDescriptor.colorAttachments[0].view =
        context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({
      label: 'render quad encoder',
    });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);

    objectInfos.forEach(({bindGroups, matrix, uniformBuffer, uniformValues}, i) => {
      const bindGroup = bindGroups[texNdx];

      const xSpacing = 1.2;
      const ySpacing = 0.7;
      const zDepth = 50;

      const x = i % 4 - 1.5;
      const y = i < 4 ? 1 : -1;

      mat4.translate(viewProjectionMatrix, [x * xSpacing, y * ySpacing, -zDepth * 0.5], matrix);
      mat4.rotateX(matrix, 0.5 * Math.PI, matrix);
      mat4.scale(matrix, [1, zDepth * 2, 1], matrix);
      mat4.translate(matrix, [-0.5, -0.5, 0], matrix);

      // copy the values from JavaScript to the GPU
      device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

      pass.setBindGroup(0, bindGroup);
      pass.draw(6);  // call our vertex shader 6 times
    });

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
