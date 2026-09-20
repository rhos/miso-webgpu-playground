const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const bilinearFilter = (tl, tr, bl, br, t1, t2) => {
  const t = mix(tl, tr, t1);
  const b = mix(bl, br, t1);
  return mix(t, b, t2);
};

const createNextMipLevelRgba8Unorm = ({data: src, width: srcWidth, height: srcHeight}) => {
  // compute the size of the next mip
  const dstWidth = Math.max(1, srcWidth / 2 | 0);
  const dstHeight = Math.max(1, srcHeight / 2 | 0);
  const dst = new Uint8Array(dstWidth * dstHeight * 4);

  const getSrcPixel = (x, y) => {
    const offset = (y * srcWidth + x) * 4;
    return src.subarray(offset, offset + 4);
  };

  for (let y = 0; y < dstHeight; ++y) {
    for (let x = 0; x < dstWidth; ++x) {
      // compute texcoord of the center of the destination texel
      const u = (x + 0.5) / dstWidth;
      const v = (y + 0.5) / dstHeight;

      // compute the same texcoord in the source - 0.5 a pixel
      const au = (u * srcWidth - 0.5);
      const av = (v * srcHeight - 0.5);

      // compute the src top left texel coord (not texcoord)
      const tx = au | 0;
      const ty = av | 0;

      // compute the mix amounts between pixels
      const t1 = au % 1;
      const t2 = av % 1;

      // get the 4 pixels
      const tl = getSrcPixel(tx, ty);
      const tr = getSrcPixel(tx + 1, ty);
      const bl = getSrcPixel(tx, ty + 1);
      const br = getSrcPixel(tx + 1, ty + 1);

      // copy the "sampled" result into the dest.
      const dstOffset = (y * dstWidth + x) * 4;
      dst.set(bilinearFilter(tl, tr, bl, br, t1, t2), dstOffset);
    }
  }
  return { data: dst, width: dstWidth, height: dstHeight };
};

const generateMips = (src, srcWidth) => {
  const srcHeight = src.length / 4 / srcWidth;

  // populate with first mip level (base level)
  let mip = { data: src, width: srcWidth, height: srcHeight, };
  const mips = [mip];

  while (mip.width > 1 || mip.height > 1) {
    mip = createNextMipLevelRgba8Unorm(mip);
    mips.push(mip);
  }
  return mips;
};

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
      scale: vec2f,
      offset: vec2f,
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

      let test = uni;
      var vsOutput: OurVertexShaderOutput;
      let xy = pos[vertexIndex];
      vsOutput.position = vec4f(xy * uni.scale + uni.offset, 0.0, 1.0);
      // vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
      vsOutput.texcoord = vec2f(xy.x, xy.y);
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

  const kTextureWidth = 5;
  const kTextureHeight = 7;
  const _ = [255,   0,   0, 255];  // red
  const y = [255, 255,   0, 255];  // yellow
  const b = [  0,   0, 255, 255];  // blue
  const textureData = new Uint8Array([
    b, _, _, _, _,
    _, y, y, y, _,
    _, y, _, _, _,
    _, y, y, _, _,
    _, y, _, _, _,
    _, y, _, _, _,
    _, _, _, _, _,
  ].flat());

  const mips = generateMips(textureData, kTextureWidth);
  const texture = device.createTexture({
    size: [mips[0].width, mips[0].height],
    mipLevelCount: mips.length,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  })

  mips.forEach(({ data, width, height }, mipLevel) => {
    device.queue.writeTexture(
      { texture, mipLevel },
      data,
      { bytesPerRow: width * 4 },
      {width: width, height: height}
    )
  })


  const uniformBufferSize =
    2 * 4 + // scale is 2 32bit floats (4bytes each)
    2 * 4;  // offset is 2 32bit floats (4bytes each)

  const uniformBuffer = device.createBuffer({
     label: 'uniforms for quad',
     size: uniformBufferSize,
     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
   });

  const uniformValues = new Float32Array(uniformBufferSize / 4);
  const kScaleOffset = 0;
  const kOffsetOffset = 2;

  /**
   * @type {GPUBindGroup[]}
   */
  const bindGroups = [];
  for (let i = 0; i < 16; ++i) {
    const sampler = device.createSampler({
      addressModeU: (i & 1) ? 'repeat' : 'clamp-to-edge',
      addressModeV: (i & 2) ? 'repeat' : 'clamp-to-edge',
      magFilter: (i & 4) ? 'linear' : 'nearest',
      minFilter: (i & 8) ? 'linear' : 'nearest'
    })

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture },
        { binding: 2, resource: uniformBuffer },
      ]
    })

    bindGroups.push(bindGroup)
  }

  const settings = {
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    magFilter: 'nearest',
    minFilter: 'linear',
    scale : 2.5
  };

  let destroyed = false;

  function resize() {
    return resizeCanvas(canvas, device);
  }

  /**
     * @param {number} time
     */
  function render(time) {
    time *= 0.001;

    if (destroyed) {
      return;
    }

    const aspect = canvas.width / canvas.height;

    colorAttachment.view = context.getCurrentTexture().createView();

    const encoder = device.createCommandEncoder({ label: "triangle encoder" });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);

    const ndx = (settings.addressModeU === 'repeat' ? 1 : 0) +
      (settings.addressModeV === 'repeat' ? 2 : 0) +
      (settings.magFilter === 'linear' ? 4 : 0) +
      (settings.minFilter === 'linear' ? 8 : 0);

    const bindGroup = bindGroups[ndx]

    const scaleX = 4 / canvas.width * settings.scale;
    const scaleY = 4 / canvas.height * settings.scale;
    uniformValues.set([scaleX, scaleY], kScaleOffset);
    uniformValues.set([Math.sin(time * 0.25) * 0.8, -0.8], kOffsetOffset);
    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

    pass.setBindGroup(0, bindGroup);

    pass.draw(6);
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    requestAnimationFrame(render);
  }

  function destroy() {
    if (destroyed) {
      return;
    }

    destroyed = true;
    context.unconfigure();
    device.destroy();
  }

  /**
   * @param {Partial<typeof settings>} newSettings
   */
  function changeSettings(newSettings) {
    Object.assign(settings, newSettings);
  }

  return { resize, render, changeSettings, destroy };
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
  var desiredWidth = Math.round(canvas.clientWidth * pixelRatio) / 64 | 0
  var desiredHeight = Math.round(canvas.clientHeight * pixelRatio) / 64 | 0

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
