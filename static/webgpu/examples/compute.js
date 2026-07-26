export async function initialize(canvas) {
  // adapter is required only for device, most webgpu api goes through device
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();

  if (!device) {
    throw new Error("WebGPU is not supported");
  }

  const module = device.createShaderModule({
    label: "doubling compute",
    code: /*wgsl */ `
      @group(0) @binding(0) var<storage, read_write> data: array<f32>;

      @compute @workgroup_size(1) fn computeSomething(
        @builtin(global_invocation_id) id: vec3u
      ){
        let i = id.x;
        data[i] = data[i] * 2.0;
      }
    `,
  });

  const pipeline = device.createComputePipeline({
    label: 'doubling pipeline',
    layout: 'auto',
    compute: {
      module,
    },
  });

  const input = new Float32Array([1, 3, 5]);
  const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(workBuffer, 0, input);

  const resultBuffer = device.createBuffer({
    label: 'result buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });

  const bindGroup = device.createBindGroup({
    label: 'bindgroup for work buffer',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: workBuffer},
    ],
  })

  let destroyed = false;

  const encoder = device.createCommandEncoder({
    label: "double encoder",
  });
  const pass = encoder.beginComputePass({
    label: 'double compute pass',
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(input.length);
  pass.end();

  encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  await resultBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(resultBuffer.getMappedRange());

  console.log('input', input);
  console.log('result', result);

  resultBuffer.unmap();

  function render() {
    if (destroyed) {
      return;
    }

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
